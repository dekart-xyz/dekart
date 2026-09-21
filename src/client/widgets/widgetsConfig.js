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
// REVIEW: Persisted order no longer depends on SQLRooms grid coordinates or per-dataset grouping.

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
    for (const panel of dashboard.panels) {
      if (chartTypes.has(panel.config.chartType)) current.push(persistedWidget(dataId, panel))
    }
  }
  const byID = new Map(current.map(widget => [widget.id, widget]))
  const widgets = []
  for (const widget of previous?.widgets || []) {
    const updated = byID.get(widget.id)
    if (updated) widgets.push(updated)
    byID.delete(widget.id)
  }
  for (const widget of current) if (byID.has(widget.id)) widgets.push(widget)
  return { version: 1, widgets }
}

// Move one persisted widget without changing any of its authored fields.
export function reorderWidgets (config, draggedId, targetId) {
  // No-op moves preserve identity so callers can suppress redundant publications.
  if (draggedId === targetId) return config
  const from = config.widgets.findIndex(widget => widget.id === draggedId)
  const to = config.widgets.findIndex(widget => widget.id === targetId)
  // Runtime drag IDs that are absent from the authored document are ignored safely.
  if (from < 0 || to < 0) return config
  const widgets = [...config.widgets]
  const [dragged] = widgets.splice(from, 1)
  widgets.splice(to, 0, dragged)
  return { ...config, widgets }
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
