import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { useDispatch, useSelector, useStore as useReduxStore } from 'react-redux'
import { getMosaicDashboardPanelId, getMosaicDashboardSelectionName } from '@sqlrooms/mosaic'
import { createKeplerMosaicFilterSync } from '../dark/kepler-mosaic-filter-sync/index'
import { widgetFilterId } from './widgetStore'
import { markKeplerPanelInteracted } from '../actions/report'

const categoricalTypes = new Set(['count-plot', 'search'])

// Keep the app store mapping separate from Kepler/Mosaic reconciliation.
function widgetFilterInputs (store, redux, datasetId, ready, editing) {
  const state = store.getState()
  const kepler = redux.getState().keplerGl.kepler.visState
  const panels = state.mosaicDashboard.config.dashboardsById[datasetId]?.panels
  const widgetColumns = state.db.tables.find(table => table.table.schema === 'widgets' && table.table.table === `d_${datasetId.replaceAll('-', '_')}`)?.columns
  return {
    ready,
    editing,
    table: kepler.datasets[datasetId],
    filters: kepler.filters,
    layers: kepler.layers,
    columnTypes: Object.fromEntries((widgetColumns || []).map(({ name, type }) => [name, type])),
    bindings: panels?.map(panel => ({
      filterId: widgetFilterId(panel.id),
      field: panel.config.settings.field,
      categorical: categoricalTypes.has(panel.config.chartType),
      clients: state.mosaicDashboard.runtime.panelClients[getMosaicDashboardPanelId(datasetId, panel.id)] || []
    }))
  }
}

// One controller owns each selection; React effects only observe app inputs.
export function useWidgetFilters (store, datasetId, ready, editing, pending) {
  const panels = useStore(store, state => state.mosaicDashboard.config.dashboardsById[datasetId]?.panels)
  const panelClients = useStore(store, state => state.mosaicDashboard.runtime.panelClients)
  const widgetColumns = useStore(store, state => state.db.tables.find(table => table.table.schema === 'widgets' && table.table.table === `d_${datasetId.replaceAll('-', '_')}`)?.columns)
  const table = useSelector(state => state.keplerGl.kepler?.visState.datasets[datasetId])
  const filters = useSelector(state => state.keplerGl.kepler?.visState.filters)
  const layers = useSelector(state => state.keplerGl.kepler?.visState.layers)
  const dispatch = useDispatch()
  const redux = useReduxStore()
  const selection = store.getState().mosaic.getSelection(getMosaicDashboardSelectionName(datasetId))
  const [error, setError] = useState('')
  const latest = useRef(null)
  latest.current = { ready: ready && !pending, editing }
  const controller = useRef(null)

  useEffect(() => {
    const sync = createKeplerMosaicFilterSync({
      dataId: datasetId,
      selection,
      ownedFilterPrefix: 'widget:',
      current: () => widgetFilterInputs(store, redux, datasetId, latest.current.ready, latest.current.editing),
      dispatch,
      defer: apply => store.getState().deferWidgetFilter(apply),
      onUserEdit: () => dispatch(markKeplerPanelInteracted()),
      onProjected: () => store.getState().projectWidgetFilters(datasetId),
      onError: setError
    })
    controller.current = sync
    sync.reconcile()
    return () => { sync.dispose(); controller.current = null }
  }, [store, redux, datasetId, selection, dispatch])

  useEffect(() => controller.current?.reconcile(), [panels, panelClients, widgetColumns, table, filters, layers, ready, editing, pending])
  return { error }
}
