import { flushSync } from 'react-dom'
import { setAutoFreeze } from 'immer'
import { numberChartType } from './NumberChart'
import { createRoomShellSlice, createRoomStore } from '@sqlrooms/room-shell'
import { createBaseDuckDbConnector } from '@sqlrooms/duckdb-core'
import { createMosaicSlice, createDashboardFeatureSlices, createDefaultMosaicDashboardPanelRenderers, createDefaultChartTypes, createMosaicDashboardChartPanelConfig } from '@sqlrooms/mosaic'
import CategoryChart, { CategorySettings } from './CategoryChart'
import ChartHeaderActions from './ChartHeaderActions'
import HistogramChart from './HistogramChart'
import { getSharedDuckDB } from '../lib/duckdb/database'
import { duckDBViewName } from '../lib/duckdb/constants'
import { deferMapPresentation } from '../lib/mapRender'

// Mosaic mutates query-client marks after they pass through the room store.
// This app resolves a separate Immer instance from SQLRooms, so configure it here.
setAutoFreeze(false)

export const widgetTableName = id => `widgets.${duckDBViewName(id)}`
export const widgetFilterId = id => `widget:${id}`
// Keep upstream builders and settings; only category interaction uses Mosaic click selection.
export const chartTypes = createDefaultChartTypes({ includeCustomSpec: false }).filter(type => ['count-plot', 'histogram'].includes(type.id)).map(type => type.id !== 'count-plot'
  ? (() => {
      const componentType = Object.fromEntries(Object.entries(type).filter(([key]) => key !== 'createSpec'))
      return {
        ...componentType,
        buildTitle: settings => settings.field?.replaceAll('_', ' ') || 'Histogram',
        renderer: HistogramChart
      }
    })()
  : {
      ...type,
      label: 'Category',
      settingsComponent: CategorySettings,
      renderer: CategoryChart
    }).concat(numberChartType)

// Each open report owns its upstream UI store and shares Dekart's one DuckDB worker.
export function createWidgetStore (onQueryPending = () => {}, onPresentationError = () => {}, trackPainting = false) {
  let pendingOperations = 0
  let db
  const connector = createBaseDuckDbConnector({}, {
    async initializeInternal () { db = await getSharedDuckDB() },
    async executeQueryInternal (sql, signal) {
      signal.throwIfAborted()
      // One counter covers concurrent chart queries, including errors and cancellation.
      onQueryPending(++pendingOperations > 0)
      try {
        const connection = await db.connect()
        // Abort can race connection teardown; cancellation of an already-closed query is complete.
        const cancel = () => connection.cancelSent().catch(() => {})
        signal.addEventListener('abort', cancel)
        try { return await connection.query(sql) } finally { signal.removeEventListener('abort', cancel); await connection.close() }
      } finally { onQueryPending(--pendingOperations > 0) }
    }
  })
  const panelRenderers = createDefaultMosaicDashboardPanelRenderers()
  for (const [key, renderer] of Object.entries(panelRenderers)) {
    if (renderer.headerActions) panelRenderers[key] = { ...renderer, headerActions: ChartHeaderActions, icon: null }
  }
  const { roomStore } = createRoomStore((set, get, store) => ({
    // Paint feedback before Kepler's synchronous scan; callers cancel superseded work.
    deferWidgetFilter (apply) {
      onQueryPending(++pendingOperations > 0)
      onPresentationError('')
      return deferMapPresentation(
        () => flushSync(apply),
        () => onQueryPending(--pendingOperations > 0),
        () => onPresentationError('Map rendering did not finish after applying the chart filter.')
      )
    },
    // Snapshot readiness waits until every authored chart reaches a drawn, failed, or empty end state.
    // Only snapshot renders track it; null keeps normal sessions free of the bookkeeping.
    paintedPanels: trackPainting ? {} : null,
    markPanelPainted (panelId) {
      const painted = get().paintedPanels
      // Ignore outside snapshots and repeat reports so subscribers only see the first paint.
      if (painted && !painted[panelId]) set({ paintedPanels: { ...painted, [panelId]: true } })
    },
    ...createRoomShellSlice({ connector, config: { title: 'Report widgets', dataSources: [] } })(set, get, store),
    ...createMosaicSlice({ preagg: { enabled: false } })(set, get, store),
    ...createDashboardFeatureSlices({ panelRenderers, chartTypes, addPanelActions: [] })(set, get, store)
  }))
  return roomStore
}

// Inference produces ordinary upstream chart configs, including a durable empty result.
export function suggestWidgets (store, datasetId, fields) {
  const api = store.getState().mosaicDashboard
  api.ensureDashboard(datasetId, 'Widgets', 'grid')
  api.setSelectedTable(datasetId, `"memory"."widgets"."${duckDBViewName(datasetId)}"`)
  const existing = api.getDashboard(datasetId).panels
  // Every dataset gets a useful total before the field-specific charts.
  if (!existing.some(panel => panel.config.chartType === 'number' && panel.config.settings.operation === 'count')) {
    api.addPanel(datasetId, createMosaicDashboardChartPanelConfig('Row count', { chartType: 'number', settings: { operation: 'count' } }))
  }
  const category = fields.find(field => ['string', 'boolean'].includes(field.type) && /category|type|status|operator|name|region/i.test(field.name)) || fields.find(field => field.type === 'string')
  const metric = fields.find(field => ['integer', 'real'].includes(field.type) && !/^(lat|latitude|lng|lon|longitude|id|index)$/i.test(field.name))
  for (const [field, chartType] of [[category, 'count-plot'], [metric, 'histogram']]) {
    if (field && !existing.some(panel => panel.config.settings.field === field.name)) {
      api.addPanel(datasetId, createMosaicDashboardChartPanelConfig(field.name.replaceAll('_', ' '), { chartType, settings: { field: field.name, ...(chartType === 'histogram' ? { maxBins: 15 } : { metric: 'count', maxBars: 20 }) } }))
    }
  }
  fitWidgetPanels(store, datasetId)
}

// Sidebar panels use the full width of each upstream grid breakpoint.
export function fitWidgetPanels (store, datasetId) {
  const api = store.getState().mosaicDashboard
  const layout = api.getDashboard(datasetId).layout
  const panels = api.getDashboard(datasetId).panels
  // Replace the upstream generated histogram heading while preserving authored titles.
  for (const panel of panels) {
    if (panel.config.chartType === 'histogram' && /^histogram of a field\s*-/i.test(panel.title)) api.updatePanel(datasetId, panel.id, { title: panel.config.settings.field.replaceAll('_', ' ') })
  }
  const layouts = Object.fromEntries(['lg', 'sm'].map(key => {
    let y = 0
    const ordered = [...layout.children].sort((a, b) => (layout.layouts[key]?.find(item => item.i === a.id)?.y ?? 0) - (layout.layouts[key]?.find(item => item.i === b.id)?.y ?? 0))
    return [key, ordered.map(child => {
      const h = panels.find(panel => panel.id === child.panel?.meta?.panelId)?.config.chartType === 'number' ? 1 : 2
      const item = { i: child.id, x: 0, y, w: key === 'lg' ? 12 : 6, h }
      y += h
      return item
    })]
  }))
  api.setLayout(datasetId, { ...layout, rowHeight: 100, margin: [0, 0], containerPadding: [0, 0], layouts })
}
