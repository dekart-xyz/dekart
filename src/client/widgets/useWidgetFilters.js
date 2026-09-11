import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { useDispatch, useSelector, useStore as useReduxStore } from 'react-redux'
import { copyTable } from '@kepler.gl/table'
import { createOrUpdateFilter, removeFilter } from '@kepler.gl/actions'
import { getMosaicDashboardPanelId, getMosaicDashboardSelectionName } from '@sqlrooms/mosaic'
import { column, isIn, isBetween, literal, Query, min, max } from '@uwdata/mosaic-sql'
import { widgetFilterId, widgetTableName } from './widgetStore'

// Native Kepler filters retain their semantics (including GPU/time/polygon filters).
export function useWidgetFilters (store, datasetId, ready) {
  const panels = useStore(store, state => state.mosaicDashboard.config.dashboardsById[datasetId]?.panels)
  const dispatch = useDispatch()
  const redux = useReduxStore()
  const table = useSelector(state => state.keplerGl.kepler?.visState.datasets[datasetId])
  const filters = useSelector(state => state.keplerGl.kepler?.visState.filters)
  const layers = useSelector(state => state.keplerGl.kepler?.visState.layers)
  const selection = store.getState().mosaic.getSelection(getMosaicDashboardSelectionName(datasetId))
  const source = useRef({})
  const defaults = useRef(new Map())
  const [clauses, setClauses] = useState([])
  const [error, setError] = useState('')
  const generation = useRef(0)
  const mirrored = useRef(new Map())

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
      const native = (filters || []).filter(filter => !filter.id.startsWith('widget:'))
      const copy = copyTable(table)
      copy.filterRecord = undefined
      const indices = copy.filterTable(native, layers, { cpuOnly: true, ignoreDomain: true }).filteredIndex
      selection.update({ source: source.current, value: indices.length === table.dataContainer.numRows() ? null : 'Map filters', predicate: indices.length === table.dataContainer.numRows() ? null : indices.length ? isIn(column('__dekart_row'), indices) : literal(false) })
      // A filter edited or removed in Kepler also updates its originating widget.
      const dashboard = store.getState().mosaicDashboard.getDashboard(datasetId)
      for (const panel of dashboard?.panels || []) {
        if (!mirrored.current.has(panel.id)) continue
        const current = filters.find(filter => filter.id === widgetFilterId(panel.id))
        if (JSON.stringify(current?.value) === JSON.stringify(mirrored.current.get(panel.id))) continue
        mirrored.current.set(panel.id, current?.value)
        const clients = store.getState().mosaicDashboard.runtime.panelClients[getMosaicDashboardPanelId(datasetId, panel.id)] || []
        const clause = selection.clauses.find(clause => clients.includes(clause.source) || clause.source === defaults.current.get(panel.id))
        if (clause) {
          const field = column(panel.config.settings.field)
          selection.update({ ...clause, value: current?.value ?? null, predicate: !current ? null : panel.config.chartType === 'histogram' ? isBetween(field, current.value) : isIn(field, current.value.map(literal)) })
        }
      }
      setError('')
    } catch (error) { setError(`Could not apply map filters: ${error.message}`) }
  }, [ready, table, filters, layers, selection, panels, datasetId, dispatch])

  useEffect(() => {
    if (!ready) return
    let alive = true
    const api = store.getState().mosaicDashboard
    // Saved widget-owned Kepler filters reconstruct defaults through stable panel identities.
    const restoreDefaults = () => {
      const { filters } = redux.getState().keplerGl.kepler.visState
      const dashboard = api.getDashboard(datasetId)
      const panelIds = new Set((dashboard?.panels || []).map(panel => panel.id))
      // Restored selections have independent owners; deleting their widget must release them.
      for (const [panelId, owner] of defaults.current) {
        if (!panelIds.has(panelId)) {
          defaults.current.delete(panelId)
          mirrored.current.delete(panelId)
          selection.update({ source: owner, value: null, predicate: null })
        }
      }
      for (const panel of dashboard?.panels || []) {
        const filter = filters.find(filter => filter.id === widgetFilterId(panel.id))
        const clients = store.getState().mosaicDashboard.runtime.panelClients[getMosaicDashboardPanelId(datasetId, panel.id)] || []
        // A live chart selection already owns its filter; do not restore a second owner.
        if (!filter || !clients.length || defaults.current.has(panel.id) || mirrored.current.has(panel.id)) continue
        const owner = { panelId: panel.id }
        defaults.current.set(panel.id, owner)
        const field = column(panel.config.settings.field)
        selection.update({ source: owner, clients: new Set(clients), value: filter.value, predicate: panel.config.chartType === 'histogram' ? isBetween(field, filter.value) : isIn(field, filter.value.map(literal)) })
      }
    }
    const stop = store.subscribe(restoreDefaults)
    restoreDefaults()
    const sync = async () => {
      const current = ++generation.current
      setClauses([...selection.clauses])
      const dashboard = api.getDashboard(datasetId)
      const active = new Set()
      for (const panel of dashboard?.panels || []) {
        const clients = store.getState().mosaicDashboard.runtime.panelClients[getMosaicDashboardPanelId(datasetId, panel.id)] || []
        // Retained chart clients register after their first render; preserve saved defaults until then.
        if (!clients.length) { active.add(widgetFilterId(panel.id)); continue }
        const clause = selection.clauses.find(clause => clients.includes(clause.source))
        const restored = defaults.current.get(panel.id)
        if (clause && restored) {
          defaults.current.delete(panel.id)
          selection.update({ source: restored, value: null, predicate: null })
          return
        }
        const selected = clause || selection.clauses.find(clause => clause.source === restored)
        if (!selected?.predicate) continue
        active.add(widgetFilterId(panel.id))
        const field = panel.config.settings.field
        let value
        try {
          if (panel.config.chartType === 'histogram') {
            // Query the actual bin predicate, rather than treating pixel brush bounds as values.
            const result = await store.getState().db.connector.query(Query.from(widgetTableName(datasetId)).select({ lo: min(field), hi: max(field) }).where(selected.predicate).toString())
            const row = result.toArray()[0]
            value = row.lo == null ? selected.value : [Number(row.lo), Number(row.hi)]
          } else {
            value = selected.value.flat()
          }
          if (!alive || current !== generation.current) return
          mirrored.current.set(panel.id, value)
          const existing = redux.getState().keplerGl.kepler.visState.filters.find(filter => filter.id === widgetFilterId(panel.id))
          if (JSON.stringify(existing?.value) !== JSON.stringify(value)) dispatch(createOrUpdateFilter(widgetFilterId(panel.id), datasetId, field, value))
        } catch (error) { setError(`Could not link the widget to the map: ${error.message}`) }
      }
      if (!alive || current !== generation.current) return
      const currentFilters = redux.getState().keplerGl.kepler.visState.filters
      currentFilters.map((filter, index) => ({ filter, index })).reverse().forEach(({ filter, index }) => {
        if (filter.id.startsWith('widget:') && filter.dataId.includes(datasetId) && !active.has(filter.id)) dispatch(removeFilter(index))
      })
    }
    selection.addEventListener('value', sync)
    setClauses([...selection.clauses])
    return () => { alive = false; generation.current++; stop(); selection.removeEventListener('value', sync) }
  }, [store, datasetId, ready, selection, dispatch, redux])

  function clear (clause) {
    if (clause.source === source.current) {
      const currentFilters = redux.getState().keplerGl.kepler.visState.filters
      currentFilters.map((filter, index) => ({ filter, index })).reverse().forEach(({ filter, index }) => {
        if (!filter.id.startsWith('widget:') && filter.dataId.includes(datasetId)) dispatch(removeFilter(index))
      })
    } else selection.update({ ...clause, value: null, predicate: null })
  }
  return { clauses, clear, error }
}
