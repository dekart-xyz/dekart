import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { useDispatch, useSelector, useStore as useReduxStore } from 'react-redux'
import { copyTable } from '@kepler.gl/table'
import { getFilterRecord } from '@kepler.gl/utils'
import { nativeFilterInputs } from '../lib/nativeFilterInputs'
import { createOrUpdateFilter, removeFilter, setFilter } from '@kepler.gl/actions'
import { getMosaicDashboardPanelId, getMosaicDashboardSelectionName } from '@sqlrooms/mosaic'
import { column, isIn, isBetween, literal } from '@uwdata/mosaic-sql'
import { widgetFilterId } from './widgetStore'
import { markKeplerPanelInteracted } from '../actions/report'

// Native Kepler filters retain their semantics (including GPU/time/polygon filters).
export function useWidgetFilters (store, datasetId, ready, editing) {
  const panels = useStore(store, state => state.mosaicDashboard.config.dashboardsById[datasetId]?.panels)
  const dispatch = useDispatch()
  const redux = useReduxStore()
  const table = useSelector(state => state.keplerGl.kepler?.visState.datasets[datasetId])
  const filters = useSelector(state => state.keplerGl.kepler?.visState.filters)
  const layers = useSelector(state => state.keplerGl.kepler?.visState.layers)
  const selection = store.getState().mosaic.getSelection(getMosaicDashboardSelectionName(datasetId))
  const source = useRef({})
  const nativeCache = useRef(null)
  const restoredClients = useRef(new Map())
  const [error, setError] = useState('')
  const [nativeError, setNativeError] = useState('')
  const mirrored = useRef(new Map())

  useEffect(() => {
    if (!ready || !table) return
    try {
      // Applicability is Kepler's contract. Chart-owned filters are separate Mosaic clauses.
      const native = getFilterRecord(datasetId, filters.filter(filter => !filter.id.startsWith('widget:')), { cpuOnly: true, ignoreDomain: true }).cpu
      const inputs = nativeFilterInputs(table, native, layers)
      const previous = nativeCache.current
      if (previous?.selection === selection && inputs.length === previous.inputs.length && inputs.every((input, index) => Object.is(input, previous.inputs[index]))) return
      return store.getState().deferWidgetFilter(() => {
        try {
          // Kepler's internal diff misses enabled/spatial changes; scan only after our inputs change.
          const copy = copyTable(table)
          copy.filterRecord = undefined
          const indices = copy.filterTable(native, layers, { cpuOnly: true, ignoreDomain: true }).filteredIndex
          const predicate = indices.length === table.dataContainer.numRows() ? null : indices.length ? isIn(column('__dekart_row'), indices) : literal(false)
          selection.update({ source: source.current, value: predicate ? 'Map filters' : null, predicate })
          nativeCache.current = { inputs, selection }
          setNativeError('')
        } catch (error) { nativeCache.current = null; setNativeError(`Could not apply map filters: ${error.message}`) }
        // Native map filters are already rendered; only chart queries remain.
        return false
      })
    } catch (error) { nativeCache.current = null; setNativeError(`Could not apply map filters: ${error.message}`) }
  }, [ready, table, filters, layers, selection, datasetId, store])

  useEffect(() => {
    if (!ready || !table) return
    try {
      // The authored panel list owns filter lifetime, including restored or late async filters.
      if (panels) {
        const panelFilters = new Set(panels.map(panel => widgetFilterId(panel.id)))
        filters.map((filter, index) => ({ filter, index })).reverse().forEach(({ filter, index }) => {
          if (filter.id.startsWith('widget:') && filter.dataId.includes(datasetId) && !panelFilters.has(filter.id)) dispatch(removeFilter(index))
        })
      }
      // A filter edited or removed in Kepler also updates its originating widget.
      const dashboard = store.getState().mosaicDashboard.getDashboard(datasetId)
      for (const panel of dashboard?.panels || []) {
        if (!mirrored.current.has(panel.id)) continue
        const current = filters.find(filter => filter.id === widgetFilterId(panel.id))
        if (JSON.stringify(current?.value) === JSON.stringify(mirrored.current.get(panel.id))) continue
        mirrored.current.set(panel.id, current?.value)
        const clients = store.getState().mosaicDashboard.runtime.panelClients[getMosaicDashboardPanelId(datasetId, panel.id)] || []
        const clause = selection.clauses.find(clause => clients.includes(clause.source) || clause.source === restoredClients.current.get(panel.id))
        const value = !current ? null : panel.config.chartType === 'count-plot' ? current.value.map(value => [value]) : current.value
        // Reset also clears Toggle's local value when Mosaic has already removed its clause.
        if (panel.config.chartType === 'count-plot') {
          const client = clients.find(client => client.selection === selection)
          if (client) client.value = value
        }
        if (clause) {
          const field = column(panel.config.settings.field)
          if (!current) selection.reset([clause])
          else selection.update({ ...clause, value, predicate: panel.config.chartType === 'histogram' ? isBetween(field, current.value) : isIn(field, current.value.map(literal)) })
        }
      }
      setError('')
    } catch (error) { setError(`Could not apply map filters: ${error.message}`) }
  }, [ready, table, filters, selection, panels, datasetId, dispatch])

  useEffect(() => {
    if (!ready) return
    const api = store.getState().mosaicDashboard
    // Saved widget-owned Kepler filters reconstruct defaults through stable panel identities.
    const restoreDefaults = () => {
      const { filters } = redux.getState().keplerGl.kepler.visState
      const dashboard = api.getDashboard(datasetId)
      const panelIds = new Set((dashboard?.panels || []).map(panel => panel.id))
      // Deleting a restored widget must release its selection too.
      for (const [panelId, client] of restoredClients.current) {
        if (!panelIds.has(panelId)) {
          restoredClients.current.delete(panelId)
          mirrored.current.delete(panelId)
          selection.update({ source: client, value: null, predicate: null })
        }
      }
      for (const panel of dashboard?.panels || []) {
        const filter = filters.find(filter => filter.id === widgetFilterId(panel.id))
        const clients = store.getState().mosaicDashboard.runtime.panelClients[getMosaicDashboardPanelId(datasetId, panel.id)] || []
        // Restore saved values through the same interactor used by clicks and the reset button.
        const client = clients.find(client => client.selection === selection)
        const restored = restoredClients.current.get(panel.id)
        if (!filter || !client || (!restored && mirrored.current.has(panel.id))) continue
        // Retained plots can be rebuilt while loading; exclusions must follow their current marks.
        if (restored === client) continue
        restoredClients.current.set(panel.id, client)
        if (restored) selection.update({ source: restored, value: null, predicate: null })
        mirrored.current.set(panel.id, filter.value)
        const value = panel.config.chartType === 'count-plot' ? filter.value.map(value => [value]) : filter.value
        client.value = value
        // SQLRooms registers interactors, not query marks. Use Mosaic's own exclusion clause.
        selection.update(client.clause(value))
      }
    }
    const stop = store.subscribe(restoreDefaults)
    restoreDefaults()
    const sync = () => {
      const dashboard = api.getDashboard(datasetId)
      const active = new Set()
      let changed = false
      for (const panel of dashboard?.panels || []) {
        const clients = store.getState().mosaicDashboard.runtime.panelClients[getMosaicDashboardPanelId(datasetId, panel.id)] || []
        // Retained chart clients register after their first render; preserve saved defaults until then.
        if (!clients.length) { active.add(widgetFilterId(panel.id)); continue }
        const clause = selection.clauses.find(clause => clients.includes(clause.source))
        const restored = restoredClients.current.get(panel.id)
        const selected = clause || selection.clauses.find(clause => clause.source === restored)
        if (!selected?.predicate) continue
        active.add(widgetFilterId(panel.id))
        const field = panel.config.settings.field
        try {
          // Both engines consume the same raw-field interval; no async bounds translation.
          const value = panel.config.chartType === 'histogram' ? selected.value : selected.value.flat()
          mirrored.current.set(panel.id, value)
          const filters = redux.getState().keplerGl.kepler.visState.filters
          const index = filters.findIndex(filter => filter.id === widgetFilterId(panel.id))
          const existing = filters[index]
          if (JSON.stringify(existing?.value) !== JSON.stringify(value)) {
            // Value-only edits avoid reinitializing the field/domain and filtering it repeatedly.
            if (existing?.dataId.length === 1 && existing.dataId[0] === datasetId && existing.name[0] === field) dispatch(setFilter(index, 'value', value))
            else dispatch(createOrUpdateFilter(widgetFilterId(panel.id), datasetId, field, value))
            changed = true
          }
        } catch (error) { setError(`Could not link the widget to the map: ${error.message}`) }
      }
      const currentFilters = redux.getState().keplerGl.kepler.visState.filters
      currentFilters.map((filter, index) => ({ filter, index })).reverse().forEach(({ filter, index }) => {
        if (filter.id.startsWith('widget:') && filter.dataId.includes(datasetId) && !active.has(filter.id)) { dispatch(removeFilter(index)); changed = true }
      })
      if (changed && editing) dispatch(markKeplerPanelInteracted())
      return changed
    }
    let cancel = () => {}
    const schedule = () => {
      cancel()
      cancel = store.getState().deferWidgetFilter(sync)
    }
    selection.addEventListener('value', schedule)
    return () => { cancel(); stop(); selection.removeEventListener('value', schedule) }
  }, [store, datasetId, ready, selection, dispatch, redux, editing])

  return { error: nativeError || error }
}
