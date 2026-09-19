// REVIEW: Synchronize SQLRooms selections and Kepler filters bidirectionally while excluding each chart's own filter from its domain.
import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { useDispatch, useSelector, useStore as useReduxStore } from 'react-redux'
import { getFilterRecord } from '@kepler.gl/utils'
import { nativeFilterInputs } from '../lib/nativeFilterInputs'
import { nativeFilterPredicate } from '../lib/nativeFilterPredicate'
import { createOrUpdateFilter, removeFilter, setFilter } from '@kepler.gl/actions'
import { getMosaicDashboardPanelId, getMosaicDashboardSelectionName } from '@sqlrooms/mosaic'
import { column, isIn, isBetween, literal } from '@uwdata/mosaic-sql'
import { widgetFilterId } from './widgetStore'
import { markKeplerPanelInteracted } from '../actions/report'

const mirroredFilterState = filter => filter && JSON.stringify({ value: filter.value, enabled: filter.enabled !== false, dataId: filter.dataId, name: filter.name })

// Native scalar Kepler filters retain the same values and inclusive bounds in chart queries.
export function useWidgetFilters (store, datasetId, ready, editing, pending) {
  const panels = useStore(store, state => state.mosaicDashboard.config.dashboardsById[datasetId]?.panels)
  const dispatch = useDispatch()
  const redux = useReduxStore()
  const table = useSelector(state => state.keplerGl.kepler?.visState.datasets[datasetId])
  const filters = useSelector(state => state.keplerGl.kepler?.visState.filters)
  const layers = useSelector(state => state.keplerGl.kepler?.visState.layers)
  const panelClients = useStore(store, state => state.mosaicDashboard.runtime.panelClients)
  const selection = store.getState().mosaic.getSelection(getMosaicDashboardSelectionName(datasetId))
  const nativeSources = useRef(new Map())
  const nativeCache = useRef(null)
  const selectionClients = useRef(new Map())
  const [error, setError] = useState('')
  const [nativeError, setNativeError] = useState('')
  const mirrored = useRef(new Map())
  const reloadRecovery = useRef(false)
  const reloadRestoreAttempted = useRef(new Set())
  const wasPending = useRef(false)
  const settled = ready && !pending
  if (pending && !wasPending.current) {
    reloadRecovery.current = true
    reloadRestoreAttempted.current.clear()
  }
  wasPending.current = pending

  useEffect(() => () => {
    // Dataset removal unmounts this bridge, so release its Mosaic clauses.
    selection.reset()
  }, [selection])

  useEffect(() => {
    if (!settled || !table) return
    try {
      // Keep native identities separate so a chart can exclude only filters on
      // its own field while Number and other fields still consume them.
      const native = filters.filter(filter => !filter.id.startsWith('widget:')).map(filter => {
        const datasetIndex = filter.dataId.indexOf(datasetId)
        const field = datasetIndex < 0 ? null : filter.name[datasetIndex]
        const interactors = field == null ? [] : (panels || []).filter(panel => panel.config.settings.field === field).flatMap(panel => panelClients[getMosaicDashboardPanelId(datasetId, panel.id)] || [])
        const clients = new Set(interactors.flatMap(client => client.selection === selection && typeof client.clause === 'function' ? [...(client.clause(client.value).clients || [])] : []))
        const record = getFilterRecord(datasetId, [filter], { cpuOnly: true, ignoreDomain: true }).cpu
        return { filter, field, interactors, clients, record, predicate: record.length ? nativeFilterPredicate(filter, datasetId) : null }
      })
      const inputs = nativeFilterInputs(table, [], layers)
      native.forEach(({ record, interactors }) => inputs.push(...nativeFilterInputs(table, record, layers).slice(2), ...interactors))
      const previous = nativeCache.current
      if (previous?.selection === selection && inputs.length === previous.inputs.length && inputs.every((input, index) => Object.is(input, previous.inputs[index]))) return
      return store.getState().deferWidgetFilter(() => {
        try {
          const activeSources = new Set()
          for (const { filter, record, clients, predicate } of native) {
            if (!record.length) continue
            let source = nativeSources.current.get(filter.id)
            if (!source) nativeSources.current.set(filter.id, (source = {}))
            activeSources.add(source)
            selection.update({ source, clients, value: predicate ? 'Map filter' : null, predicate })
          }
          for (const [id, source] of nativeSources.current) {
            if (activeSources.has(source)) continue
            selection.update({ source, value: null, predicate: null })
            nativeSources.current.delete(id)
          }
          nativeCache.current = { inputs, selection }
          setNativeError('')
        } catch (error) { nativeCache.current = null; setNativeError(`Could not apply map filters: ${error.message}`) }
        // Native map filters are already rendered; only chart queries remain.
        return false
      })
    } catch (error) { nativeCache.current = null; setNativeError(`Could not apply map filters: ${error.message}`) }
  }, [settled, table, filters, layers, selection, datasetId, store, panels, panelClients])

  useEffect(() => {
    if (!ready || (!pending && !reloadRecovery.current)) return
    const currentTable = redux.getState().keplerGl.kepler?.visState.datasets[datasetId]
    if (typeof currentTable?.filterTable !== 'function') return
    let restoring = false
    const clearSelection = panel => {
      const clients = store.getState().mosaicDashboard.runtime.panelClients[getMosaicDashboardPanelId(datasetId, panel.id)] || []
      const tracked = selectionClients.current.get(panel.id)
      const sources = new Set([...clients, tracked].filter(Boolean))
      const clauses = selection.clauses.filter(clause => sources.has(clause.source))
      clients.filter(client => client.selection === selection).forEach(client => { client.value = null })
      if (clauses.length) selection.reset(clauses)
      if (tracked && !clients.includes(tracked)) selection.update({ source: tracked, value: null, predicate: null })
      selectionClients.current.delete(panel.id)
      mirrored.current.set(panel.id, mirroredFilterState())
    }
    for (const panel of panels || []) {
      const filterIndex = filters.findIndex(filter => filter.id === widgetFilterId(panel.id))
      const filter = filters[filterIndex]
      const previous = JSON.parse(mirrored.current.get(panel.id) || 'null')
      // Preserve the canonical value while Kepler exposes a transient missing or empty loading domain.
      if (!previous?.value?.length) continue
      if (!filter) {
        if (!pending && reloadRestoreAttempted.current.has(panel.id)) {
          reloadRecovery.current = false
          clearSelection(panel)
          continue
        }
        restoring = true
        reloadRestoreAttempted.current.add(panel.id)
        dispatch(createOrUpdateFilter(widgetFilterId(panel.id), datasetId, panel.config.settings.field, previous.value))
        if (previous.enabled === false) {
          const restored = redux.getState().keplerGl.kepler.visState.filters.findIndex(filter => filter.id === widgetFilterId(panel.id))
          if (restored >= 0) dispatch(setFilter(restored, 'enabled', false))
        }
      } else if (!filter.value?.length) {
        if (!pending && reloadRestoreAttempted.current.has(panel.id)) {
          reloadRecovery.current = false
          clearSelection(panel)
          continue
        }
        restoring = true
        reloadRestoreAttempted.current.add(panel.id)
        dispatch(setFilter(filterIndex, 'value', previous.value))
      } else {
        reloadRestoreAttempted.current.delete(panel.id)
      }
    }
    if (!pending && !restoring) reloadRecovery.current = false
  }, [ready, pending, table, panels, filters, datasetId, dispatch, redux])

  useEffect(() => {
    if (!settled || !table) return
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
        const currentIndex = filters.indexOf(current)
        if (reloadRecovery.current && !current) continue
        // Reloads temporarily empty Kepler's value; reconcile only against the completed domain.
        if (current && !current.value?.length) {
          const previous = JSON.parse(mirrored.current.get(panel.id) || 'null')
          const retained = panel.config.chartType === 'count-plot' ? (previous?.value || []).filter(value => current.domain?.includes(value)) : []
          if (retained.length) dispatch(setFilter(currentIndex, 'value', retained))
          else {
            const clients = store.getState().mosaicDashboard.runtime.panelClients[getMosaicDashboardPanelId(datasetId, panel.id)] || []
            const clause = selection.clauses.find(clause => clients.includes(clause.source) || clause.source === selectionClients.current.get(panel.id))
            const client = clients.find(client => client.selection === selection)
            if (client) client.value = null
            if (clause) selection.reset([clause])
            selectionClients.current.delete(panel.id)
            mirrored.current.set(panel.id, mirroredFilterState())
            dispatch(removeFilter(currentIndex))
          }
          continue
        }
        const currentState = mirroredFilterState(current)
        if (currentState === mirrored.current.get(panel.id)) continue
        mirrored.current.set(panel.id, currentState)
        const clients = store.getState().mosaicDashboard.runtime.panelClients[getMosaicDashboardPanelId(datasetId, panel.id)] || []
        const clause = selection.clauses.find(clause => clients.includes(clause.source) || clause.source === selectionClients.current.get(panel.id))
        const enabled = current && current.enabled !== false
        const value = !enabled ? null : panel.config.chartType === 'count-plot' ? current.value.map(value => [value]) : current.value
        // Reset also clears Toggle's local value when Mosaic has already removed its clause.
        if (panel.config.chartType === 'count-plot') {
          const client = clients.find(client => client.selection === selection)
          if (client) client.value = value
        }
        if (enabled && !clause) {
          const client = clients.find(client => client.selection === selection)
          if (client) selection.update(client.clause(value))
        } else if (clause) {
          const field = column(panel.config.settings.field)
          if (!enabled) selection.reset([clause])
          else selection.update({ ...clause, value, predicate: panel.config.chartType === 'histogram' ? isBetween(field, current.value) : isIn(field, current.value.map(literal)) })
        }
      }
      setError('')
    } catch (error) { setError(`Could not apply map filters: ${error.message}`) }
  }, [settled, table, filters, selection, panels, datasetId, dispatch])

  useEffect(() => {
    if (!settled) return
    const api = store.getState().mosaicDashboard
    // Saved widget-owned Kepler filters reconstruct defaults through stable panel identities.
    const restoreDefaults = () => {
      const { filters } = redux.getState().keplerGl.kepler.visState
      const dashboard = api.getDashboard(datasetId)
      const panelIds = new Set((dashboard?.panels || []).map(panel => panel.id))
      // Removing or moving a filtering widget must release its last clause source.
      for (const [panelId, client] of selectionClients.current) {
        if (!panelIds.has(panelId)) {
          selectionClients.current.delete(panelId)
          mirrored.current.delete(panelId)
          selection.update({ source: client, value: null, predicate: null })
        }
      }
      for (const panel of dashboard?.panels || []) {
        const filter = filters.find(filter => filter.id === widgetFilterId(panel.id))
        const clients = store.getState().mosaicDashboard.runtime.panelClients[getMosaicDashboardPanelId(datasetId, panel.id)] || []
        // Restore saved values through the same interactor used by clicks and the reset button.
        const client = clients.find(client => client.selection === selection)
        const tracked = selectionClients.current.get(panel.id)
        if (!filter || !client || (!tracked && mirrored.current.has(panel.id))) continue
        // Retained plots can be rebuilt while loading; exclusions must follow their current marks.
        if (tracked === client) continue
        if (tracked) selection.update({ source: tracked, value: null, predicate: null })
        mirrored.current.set(panel.id, mirroredFilterState(filter))
        if (filter.enabled === false) {
          selectionClients.current.delete(panel.id)
          client.value = null
          continue
        }
        selectionClients.current.set(panel.id, client)
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
        const filters = redux.getState().keplerGl.kepler.visState.filters
        const filterId = widgetFilterId(panel.id)
        const filterIndex = filters.findIndex(filter => filter.id === filterId)
        const existing = filters[filterIndex]
        const clients = store.getState().mosaicDashboard.runtime.panelClients[getMosaicDashboardPanelId(datasetId, panel.id)] || []
        // Retained chart clients register after their first render; preserve saved defaults until then.
        if (!clients.length) { active.add(filterId); continue }
        const clause = selection.clauses.find(clause => clients.includes(clause.source))
        const tracked = selectionClients.current.get(panel.id)
        const selected = clause || selection.clauses.find(clause => clause.source === tracked)
        if (!selected?.predicate) {
          if (existing?.enabled === false) active.add(filterId)
          continue
        }
        selectionClients.current.set(panel.id, selected.source)
        active.add(filterId)
        const field = panel.config.settings.field
        try {
          // Both engines consume the same raw-field interval; no async bounds translation.
          const value = panel.config.chartType === 'histogram' ? selected.value : selected.value.flat()
          mirrored.current.set(panel.id, mirroredFilterState({ value, enabled: true, dataId: [datasetId], name: [field] }))
          if (existing?.enabled === false) { dispatch(setFilter(filterIndex, 'enabled', true)); changed = true }
          if (JSON.stringify(existing?.value) !== JSON.stringify(value)) {
            // Value-only edits avoid reinitializing the field/domain and filtering it repeatedly.
            if (existing?.dataId.length === 1 && existing.dataId[0] === datasetId && existing.name[0] === field) dispatch(setFilter(filterIndex, 'value', value))
            else dispatch(createOrUpdateFilter(filterId, datasetId, field, value))
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
  }, [store, datasetId, settled, selection, dispatch, redux, editing])

  return { error: nativeError || error }
}
