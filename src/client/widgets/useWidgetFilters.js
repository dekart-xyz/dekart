import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { useDispatch, useSelector, useStore as useReduxStore } from 'react-redux'
import { getFilterRecord } from '@kepler.gl/utils'
import { createOrUpdateFilter, removeFilter, setFilter } from '@kepler.gl/actions'
import { getMosaicDashboardPanelId, getMosaicDashboardSelectionName } from '@sqlrooms/mosaic'
import { deriveFilterClauses } from '../dark/kepler-filter-to-sql/index'
import { nativeFilterInputs } from '../lib/nativeFilterInputs'
import { polygonFilterClause } from '../lib/polygonFilterClause'
import { widgetFilterId } from './widgetStore'
import { markKeplerPanelInteracted } from '../actions/report'

const categoricalTypes = new Set(['count-plot', 'search'])

// Track clauses created from Kepler filters to prevent feedback loops.
// Mosaic delivers some value events asynchronously; retain origin by clause identity, not values.
function applyKeplerClause (selection, canonicalClauses, clause) {
  canonicalClauses.add(clause)
  selection.update(clause)
}

// Kepler owns filter values; Mosaic interactors only submit user changes.
export function useWidgetFilters (store, datasetId, ready, editing, pending) {
  const panels = useStore(store, state => state.mosaicDashboard.config.dashboardsById[datasetId]?.panels)
  const dispatch = useDispatch()
  const redux = useReduxStore()
  const table = useSelector(state => state.keplerGl.kepler?.visState.datasets[datasetId])
  const filters = useSelector(state => state.keplerGl.kepler?.visState.filters)
  const layers = useSelector(state => state.keplerGl.kepler?.visState.layers)
  const widgetColumns = useStore(store, state => state.db.tables.find(table => table.table.schema === 'widgets' && table.table.table === `d_${datasetId.replaceAll('-', '_')}`)?.columns)
  const panelClients = useStore(store, state => state.mosaicDashboard.runtime.panelClients)
  // Mosaic’s shared filter container for the charts associated with this datasetId
  const selection = store.getState().mosaic.getSelection(getMosaicDashboardSelectionName(datasetId))
  // Cache clause sources (which Mosaic object owns each chart condition, so we can replace or remove it) and input identities (references to the filters, fields, and layers used last time, so we can skip work when they haven’t changed) instead of keeping a second copy of authored filter values.
  const sources = useRef(new Map())
  const cache = useRef(null)
  const canonicalClauses = useRef(new WeakSet())
  const [error, setError] = useState('')
  const settled = ready && !pending

  useEffect(() => () => selection.reset(), [selection])

  useEffect(() => {
    if (!settled || !table || panels === undefined) return
    // Only the owner dataset cleans up deleted panels; receivers retain cross filters.
    const active = new Set(panels.map(panel => widgetFilterId(panel.id)))
    const orphans = filters.filter(filter => filter.id.startsWith('widget:') &&
      filter.dataId[0] === datasetId && !active.has(filter.id)).reverse()
    for (const orphan of orphans) {
      dispatch(removeFilter(redux.getState().keplerGl.kepler.visState.filters.findIndex(filter => filter.id === orphan.id)))
    }
  }, [settled, table, filters, datasetId, panels, dispatch, redux])

  useEffect(() => {
    if (!settled || !table) return
    try {
      const columnTypes = Object.fromEntries((widgetColumns || []).map(({ name, type }) => [name, type]))
      // TODO: widgets with a polygon map filter → filters charts for a Named points point layer fails locally
      const record = getFilterRecord(datasetId, filters, { cpuOnly: true, ignoreDomain: true }).cpu
      const clauses = deriveFilterClauses(filters, datasetId,
        new Set(record.map(filter => filter.id)),
        filter => polygonFilterClause(filter, datasetId, layers, columnTypes))
      const bindings = clauses.map(clause => {
        const interactors = (panels || []).filter(panel => panel.config.settings.field === clause.field)
          .flatMap(panel => panelClients[getMosaicDashboardPanelId(datasetId, panel.id)] || [])
        const clients = new Set(interactors.flatMap(client => client.selection === selection && typeof client.clause === 'function'
          ? [...(client.clause(client.value).clients || [])]
          : []))
        const owner = panels?.find(panel => widgetFilterId(panel.id) === clause.filterId)
        const ownerClients = owner ? panelClients[getMosaicDashboardPanelId(datasetId, owner.id)] || [] : []
        const client = ownerClients.find(client => client.selection === selection)
        return { ...clause, clients, client, owner }
      })
      const inputs = nativeFilterInputs(table, record, layers, columnTypes)
      // Track disabled and full-domain filters too: their owner interactors still need clearing.
      inputs.push(...filters, ...bindings.flatMap(binding => [binding.client, ...binding.clients]))
      const previous = cache.current
      if (previous?.selection === selection && inputs.length === previous.inputs.length && inputs.every((input, index) => Object.is(input, previous.inputs[index]))) return
      return store.getState().deferWidgetFilter(() => {
        try {
          const active = new Set()
          for (const { filterId, sqlCondition, clients, client, owner } of bindings) {
            let source = client || sources.current.get(filterId)
            if (!source) source = {}
            const oldSource = sources.current.get(filterId)
            // Rebuilt plots replace their interactor; release its old clause before rebinding.
            if (oldSource && oldSource !== source) applyKeplerClause(selection, canonicalClauses.current, { source: oldSource, value: null, predicate: null })
            sources.current.set(filterId, source)
            active.add(filterId)
            const filter = filters.find(filter => filter.id === filterId)
            const value = client
              ? filter.enabled !== false && sqlCondition
                ? categoricalTypes.has(owner.config.chartType) ? filter.value.map(value => [value]) : filter.value
                : categoricalTypes.has(owner.config.chartType) ? null : undefined
              : sqlCondition ? 'Map filter' : null
            if (client) client.value = value
            // The same interactor source atomically replaces the click clause with the canonical clause.
            applyKeplerClause(selection, canonicalClauses.current, { source, clients, value, predicate: sqlCondition })
          }
          for (const [id, source] of sources.current) {
            if (active.has(id)) continue
            source.value = null
            applyKeplerClause(selection, canonicalClauses.current, { source, value: null, predicate: null })
            sources.current.delete(id)
          }
          cache.current = { inputs, selection }
          setError('')
        } catch (error) { cache.current = null; setError(`Could not apply map filters: ${error.message}`) }
        return false
      })
    } catch (error) { cache.current = null; setError(`Could not apply map filters: ${error.message}`) }
  }, [settled, table, filters, layers, widgetColumns, selection, datasetId, store, panels, panelClients])

  useEffect(() => {
    if (!settled) return
    let cancel = () => {}
    const schedule = () => {
      const clause = selection.active
      if (clause && canonicalClauses.current.has(clause)) return
      const dashboard = store.getState().mosaicDashboard.getDashboard(datasetId)
      const panel = dashboard?.panels.find(panel =>
        (store.getState().mosaicDashboard.runtime.panelClients[getMosaicDashboardPanelId(datasetId, panel.id)] || []).includes(clause?.source))
      if (!panel) return
      // Capture the user event before a deferred read replaces the active clause.
      const value = clause.predicate ? categoricalTypes.has(panel.config.chartType) ? clause.value.flat() : clause.value : null
      cancel()
      cancel = store.getState().deferWidgetFilter(() => {
        const filters = redux.getState().keplerGl.kepler.visState.filters
        const id = widgetFilterId(panel.id)
        const index = filters.findIndex(filter => filter.id === id)
        const existing = filters[index]
        const field = panel.config.settings.field
        let changed = false
        try {
          if (value === null) {
            if (existing && existing.enabled !== false) { dispatch(removeFilter(index)); changed = true }
          } else {
            if (existing?.enabled === false) { dispatch(setFilter(index, 'enabled', true)); changed = true }
            if (JSON.stringify(existing?.value) !== JSON.stringify(value)) {
              // Keep the field guard: switching widget columns must rebuild the filter domain.
              if (existing?.dataId[0] === datasetId && existing.name[0] === field) dispatch(setFilter(index, 'value', value))
              else dispatch(createOrUpdateFilter(id, datasetId, field, value))
              changed = true
            }
          }
          if (changed && editing) dispatch(markKeplerPanelInteracted())
        } catch (error) { setError(`Could not link the widget to the map: ${error.message}`) }
        return changed
      })
    }
    selection.addEventListener('value', schedule)
    return () => { cancel(); selection.removeEventListener('value', schedule) }
  }, [store, datasetId, settled, selection, dispatch, redux, editing])

  return { error }
}
