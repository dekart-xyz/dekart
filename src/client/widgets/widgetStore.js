import { numberChartType } from './NumberChart'
import { setAutoFreeze } from 'immer'
import { createRoomShellSlice, createRoomStore } from '@sqlrooms/room-shell'
import { createBaseDuckDbConnector } from '@sqlrooms/duckdb-core'
import { createMosaicSlice, createDashboardFeatureSlices, createDefaultMosaicDashboardPanelRenderers, createDefaultChartTypes, createMosaicDashboardChartPanelConfig } from '@sqlrooms/mosaic'
import CategoryChart from './CategoryChart'
import ChartHeaderActions from './ChartHeaderActions'
import { createHistogramSpec } from '@sqlrooms/mosaic/dist/charts/chart-types/histogram/spec'
import { getSharedDuckDB } from '../lib/duckdb/database'
import { duckDBViewName } from '../lib/duckdb/constants'

setAutoFreeze(false)
export const widgetTableName = id => `widgets.${duckDBViewName(id)}`
export const widgetFilterId = id => `widget:${id}`
// Keep upstream builders and settings; only category interaction uses Mosaic click selection.
export const chartTypes = createDefaultChartTypes({ includeCustomSpec: false }).filter(type => ['count-plot', 'histogram'].includes(type.id)).map(type => type.id !== 'count-plot'
  ? {
      ...type,
      buildTitle: settings => settings.field?.replaceAll('_', ' ') || 'Histogram',
      createSpec: options => {
        const spec = createHistogramSpec(options)
        return { ...spec, yAxis: null, yLabel: null, xLabel: null, xTicks: 4, margins: { left: 8, right: 8, top: 8, bottom: 28 }, plot: spec.plot.map(mark => mark.mark ? { ...mark, fill: mark.data.filterBy ? '#36b99a' : '#1b1e26' } : mark) }
      }
    }
  : {
      ...type,
      label: 'Category',
      renderer: CategoryChart
    }).concat(numberChartType)

// Each open report owns its upstream UI store and shares Dekart's one DuckDB worker.
export function createWidgetStore (onQueryPending = () => {}) {
  let pendingQueries = 0
  let db
  const connector = createBaseDuckDbConnector({}, {
    async initializeInternal () { db = await getSharedDuckDB() },
    async executeQueryInternal (sql, signal) {
      signal.throwIfAborted()
      // One counter covers concurrent chart queries, including errors and cancellation.
      onQueryPending(++pendingQueries > 0)
      try {
        const connection = await db.connect()
        const cancel = () => connection.cancelSent()
        signal.addEventListener('abort', cancel)
        try { return await connection.query(sql) } finally { signal.removeEventListener('abort', cancel); await connection.close() }
      } finally { onQueryPending(--pendingQueries > 0) }
    }
  })
  const panelRenderers = createDefaultMosaicDashboardPanelRenderers()
  for (const [key, renderer] of Object.entries(panelRenderers)) {
    if (renderer.headerActions) panelRenderers[key] = { ...renderer, headerActions: ChartHeaderActions, icon: null }
  }
  const { roomStore } = createRoomStore((set, get, store) => ({
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
