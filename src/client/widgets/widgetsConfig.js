const chartTypes = new Set(['number', 'count-plot', 'histogram'])

export function emptyWidgetsConfig () {
  return { version: 1, widgets: [] }
}

// Parse only what the runtime adapter needs. The server JSON Schema remains the persisted contract authority.
export function parseWidgetsConfig (raw) {
  const value = raw || JSON.stringify(emptyWidgetsConfig())
  try {
    const root = JSON.parse(value)
    if (!root || root.version !== 1 || !Array.isArray(root.widgets)) throw new Error('unsupported envelope')
    const ids = new Set()
    for (const widget of root.widgets) {
      if (!widget || typeof widget.id !== 'string' || ids.has(widget.id) || typeof widget.dataId !== 'string' || !chartTypes.has(widget.type) || typeof widget.title !== 'string' || !widget.settings || typeof widget.settings !== 'object' || Array.isArray(widget.settings)) throw new Error('unsupported widget')
      ids.add(widget.id)
    }
    return { config: root, raw: value }
  } catch (error) {
    throw new Error(`Invalid persisted widget configuration: ${error.message}`)
  }
}

function numberSettings (settings) {
  return {
    operation: settings.operation || 'count',
    ...(settings.field ? { field: settings.field } : {}),
    format: settings.format || 'auto',
    decimals: settings.decimals ?? 2,
    subtitle: settings.subtitle || '',
    prefix: settings.prefix || '',
    suffix: settings.suffix || ''
  }
}

function chartSettings (chartType, settings) {
  if (chartType === 'number') return numberSettings(settings)
  if (chartType === 'count-plot') return { field: settings.field, metric: 'count', sort: settings.sort || 'value-desc', maxBars: settings.maxBars ?? 20 }
  return { field: settings.field, maxBins: settings.maxBins ?? 15, ...(settings.color ? { color: settings.color } : {}) }
}

function orderedPanels (dashboard) {
  const panels = dashboard.panels.filter(panel => chartTypes.has(panel.config.chartType))
  const ids = new Set(panels.map(panel => panel.id))
  const children = dashboard.layout?.children || []
  const grid = dashboard.layout?.layouts?.sm || dashboard.layout?.layouts?.lg || []
  const position = new Map(grid.map(item => [item.i, item]))
  // The widgets pane is narrower than SQLRooms' 768px breakpoint, so `sm` is
  // the layout users drag. SQLRooms keeps child insertion order unchanged.
  const layoutOrder = children
    .map((child, index) => ({ child, index, position: position.get(child.id) }))
    .sort((left, right) => (left.position?.y ?? Infinity) - (right.position?.y ?? Infinity) || (left.position?.x ?? Infinity) - (right.position?.x ?? Infinity) || left.index - right.index)
    .map(({ child }) => child.panel?.meta?.panelId)
    .filter(id => ids.has(id))
  const order = [...layoutOrder, ...panels.map(panel => panel.id).filter(id => !layoutOrder.includes(id))]
  const byID = Object.fromEntries(panels.map(panel => [panel.id, panel]))
  return order.map(id => byID[id])
}

function persistedWidget (dataId, panel) {
  return {
    id: panel.id,
    dataId,
    type: panel.config.chartType,
    title: panel.title,
    settings: chartSettings(panel.config.chartType, panel.config.settings || {})
  }
}

// Strip SQLRooms runtime state while preserving the previous document's global widget order.
export function serializeWidgetsConfig (runtimeConfig, previous) {
  const current = []
  for (const [dataId, dashboard] of Object.entries(runtimeConfig.dashboardsById)) {
    for (const panel of orderedPanels(dashboard)) current.push(persistedWidget(dataId, panel))
  }
  const byDataID = new Map()
  for (const widget of current) {
    const widgets = byDataID.get(widget.dataId) || []
    widgets.push(widget)
    byDataID.set(widget.dataId, widgets)
  }
  const consumed = new Map()
  const widgets = []
  for (const widget of previous?.widgets || []) {
    const index = consumed.get(widget.dataId) || 0
    const updated = byDataID.get(widget.dataId)?.[index]
    if (!updated) continue
    widgets.push(updated)
    consumed.set(widget.dataId, index + 1)
  }
  for (const widget of current) {
    const remaining = byDataID.get(widget.dataId)?.slice(consumed.get(widget.dataId) || 0) || []
    if (!remaining.some(candidate => candidate.id === widget.id)) continue
    widgets.push(widget)
    consumed.set(widget.dataId, (consumed.get(widget.dataId) || 0) + 1)
  }
  return { version: 1, widgets }
}

// converts persisted widget JSON into SQLRooms runtime state
export function applyWidgetsConfig (store, persisted, datasetIds) {
  const api = store.getState().mosaicDashboard
  api.clearAllDashboardRuntime()
  api.setConfig({ dashboardsById: {} })
  const bound = new Set(datasetIds)
  for (const widget of persisted?.widgets || []) {
    if (!bound.has(widget.dataId)) continue
    api.ensureDashboard(widget.dataId, 'Widgets', 'grid')
    api.setSelectedTable(widget.dataId, `"memory"."widgets"."d_${widget.dataId.replaceAll('-', '_')}"`)
    api.addPanel(widget.dataId, {
      id: widget.id,
      type: 'vgplot',
      title: widget.title,
      config: { chartType: widget.type, settings: chartSettings(widget.type, widget.settings) }
    })
  }
}
