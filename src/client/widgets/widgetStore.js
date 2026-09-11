import { setAutoFreeze } from 'immer'
import { createRoomShellSlice, createRoomStore } from '@sqlrooms/room-shell'
import { createBaseDuckDbConnector } from '@sqlrooms/duckdb-core'
import { createMosaicSlice, createDashboardFeatureSlices, createDefaultMosaicDashboardPanelRenderers, createDefaultChartTypes, createMosaicDashboardChartPanelConfig } from '@sqlrooms/mosaic'
import { createCountPlotSpec } from '@sqlrooms/mosaic/dist/charts/chart-types/count-plot/spec'
import { getSharedDuckDB } from '../lib/duckdb/database'
import { duckDBViewName } from '../lib/duckdb/constants'

setAutoFreeze(false)
export const widgetTableName = id => `widgets.${duckDBViewName(id)}`
export const widgetFilterId = id => `widget:${id}`
// Keep upstream builders and settings; only category interaction uses Mosaic click selection.
export const chartTypes = createDefaultChartTypes({ includeCustomSpec: false }).filter(type => ['count-plot', 'histogram'].includes(type.id)).map(type => type.id !== 'count-plot'
  ? type
  : {
      ...type,
      label: 'Category',
      createSpec: options => {
        const spec = createCountPlotSpec(options)
        const plot = spec.plot.filter(mark => !mark.select)
        plot.splice(2, 0, { select: 'toggleY', as: '$brush' })
        return { ...spec, plot }
      }
    })

// Each open report owns its upstream UI store and shares Dekart's one DuckDB worker.
export function createWidgetStore () {
  let db
  const connector = createBaseDuckDbConnector({}, {
    async initializeInternal () { db = await getSharedDuckDB() },
    async executeQueryInternal (sql, signal) {
      signal.throwIfAborted()
      const connection = await db.connect()
      const cancel = () => connection.cancelSent()
      signal.addEventListener('abort', cancel)
      try { return await connection.query(sql) } finally { signal.removeEventListener('abort', cancel); await connection.close() }
    }
  })
  const { roomStore } = createRoomStore((set, get, store) => ({
    ...createRoomShellSlice({ connector, config: { title: 'Report widgets', dataSources: [] } })(set, get, store),
    ...createMosaicSlice({ preagg: { enabled: false } })(set, get, store),
    ...createDashboardFeatureSlices({ panelRenderers: createDefaultMosaicDashboardPanelRenderers(), chartTypes, addPanelActions: [] })(set, get, store)
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
  api.setLayout(datasetId, { ...layout, rowHeight: 120, layouts: Object.fromEntries(['lg', 'sm'].map(key => [key, layout.children.map((child, index) => ({ i: child.id, x: 0, y: index * 2, w: key === 'lg' ? 12 : 6, h: 2 }))])) })
}
