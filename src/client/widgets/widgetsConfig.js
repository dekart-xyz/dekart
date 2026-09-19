// REVIEW: Define the strict Widgets V1 client contract and translate between durable configuration and SQLRooms runtime state.
const allowedRootKeys = new Set(['version', 'provider', 'initialized', 'config'])
const allowedDashboardKeys = new Set(['id', 'title', 'panelOrder', 'panels'])
const allowedPanelKeys = new Set(['id', 'type', 'title', 'config'])
const allowedConfigKeys = new Set(['chartType', 'settings'])
const settingsKeys = {
  number: new Set(['operation', 'field', 'format', 'decimals', 'subtitle', 'prefix', 'suffix']),
  'count-plot': new Set(['field', 'metric', 'sort', 'maxBars']),
  histogram: new Set(['field', 'maxBins', 'color'])
}

const onlyKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.has(key))
const identifier = /^[A-Za-z0-9_-]{1,128}$/
const string = (value, max = 256) => typeof value === 'string' && value.length <= max
const optional = (value, predicate) => value === undefined || predicate(value)
const integerBetween = (value, min, max) => Number.isInteger(value) && value >= min && value <= max

function validSettings (chartType, settings) {
  if (!onlyKeys(settings, settingsKeys[chartType])) return false
  if (chartType === 'number') {
    const operations = ['count', 'distinct', 'sum', 'avg', 'min', 'max', 'median']
    return operations.includes(settings.operation) && (settings.operation === 'count' || (string(settings.field) && settings.field.length > 0)) && optional(settings.format, value => ['auto', 'number', 'compact', 'percent'].includes(value)) && optional(settings.decimals, value => integerBetween(value, 0, 6)) && ['subtitle', 'prefix', 'suffix'].every(key => optional(settings[key], string))
  }
  if (!string(settings.field) || settings.field.length === 0) return false
  if (chartType === 'count-plot') return optional(settings.metric, value => value === 'count') && optional(settings.sort, value => ['value-desc', 'value-asc', 'label-asc', 'label-desc'].includes(value)) && optional(settings.maxBars, value => integerBetween(value, 1, 100))
  return optional(settings.maxBins, value => integerBetween(value, 1, 1000)) && optional(settings.color, value => string(value, 64) && value.length > 0)
}

export function emptyWidgetsConfig () {
  return { version: 1, provider: 'sqlrooms', config: { dashboardsById: {} } }
}

export function parseWidgetsConfig (raw) {
  const value = raw || JSON.stringify(emptyWidgetsConfig())
  try {
    const root = JSON.parse(value)
    if (root.version !== 1 || root.provider !== 'sqlrooms' || !onlyKeys(root, allowedRootKeys) || !onlyKeys(root.config, new Set(['dashboardsById']))) throw new Error('unsupported envelope')
    const dashboards = root.config.dashboardsById
    if (!dashboards || typeof dashboards !== 'object' || Array.isArray(dashboards)) throw new Error('invalid dashboards')
    const reportPanelIds = new Set()
    for (const [dashboardId, dashboard] of Object.entries(dashboards)) {
      if (!onlyKeys(dashboard, allowedDashboardKeys) || dashboard.id !== dashboardId || !string(dashboardId) || !string(dashboard.title) || !Array.isArray(dashboard.panels) || !Array.isArray(dashboard.panelOrder)) throw new Error('unsupported dashboard')
      const panelIds = new Set(dashboard.panels.map(panel => panel.id))
      if (panelIds.size !== dashboard.panels.length || dashboard.panelOrder.length !== panelIds.size || !dashboard.panelOrder.every(id => panelIds.has(id))) throw new Error('invalid panel order')
      for (const panel of dashboard.panels) {
        if (!onlyKeys(panel, allowedPanelKeys) || !identifier.test(panel.id) || reportPanelIds.has(panel.id) || !string(panel.title) || panel.type !== 'vgplot' || !onlyKeys(panel.config, allowedConfigKeys) || !validSettings(panel.config.chartType, panel.config.settings)) throw new Error('unsupported panel')
        reportPanelIds.add(panel.id)
      }
    }
    return { config: root, raw: value }
  } catch (error) {
    throw new Error(`Invalid persisted widget configuration: ${error.message}`)
  }
}

const numberSettings = settings => ({
  operation: settings.operation || 'count',
  ...(settings.field ? { field: settings.field } : {}),
  format: settings.format || 'auto',
  decimals: settings.decimals ?? 2,
  subtitle: settings.subtitle || '',
  prefix: settings.prefix || '',
  suffix: settings.suffix || ''
})

const chartSettings = (chartType, settings) => chartType === 'number'
  ? numberSettings(settings)
  : chartType === 'count-plot'
    ? { field: settings.field, metric: 'count', sort: settings.sort || 'value-desc', maxBars: settings.maxBars ?? 20 }
    : { field: settings.field, maxBins: settings.maxBins ?? 15, ...(settings.color ? { color: settings.color } : {}) }

// Strip SQLRooms runtime state. Persisted config contains no table, SQL, layout,
// selection, client, cache, timestamp or editor-open state.
export function serializeWidgetsConfig (runtimeConfig, initialized) {
  const dashboardsById = Object.fromEntries(Object.entries(runtimeConfig.dashboardsById).map(([id, dashboard]) => {
    const panels = dashboard.panels.filter(panel => settingsKeys[panel.config.chartType]).map(panel => ({
      id: panel.id,
      type: 'vgplot',
      title: panel.title,
      config: { chartType: panel.config.chartType, settings: chartSettings(panel.config.chartType, panel.config.settings || {}) }
    }))
    const ids = new Set(panels.map(panel => panel.id))
    const layoutOrder = (dashboard.layout?.children || []).map(child => child.panel?.meta?.panelId).filter(id => ids.has(id))
    const panelOrder = [...layoutOrder, ...panels.map(panel => panel.id).filter(id => !layoutOrder.includes(id))]
    return [id, { id, title: dashboard.title || 'Widgets', panelOrder, panels }]
  }))
  return { version: 1, provider: 'sqlrooms', ...(initialized === undefined ? {} : { initialized }), config: { dashboardsById } }
}

export function applyWidgetsConfig (store, persisted) {
  const api = store.getState().mosaicDashboard
  api.clearAllDashboardRuntime()
  api.setConfig({ dashboardsById: {} })
  for (const dashboard of Object.values(persisted?.config?.dashboardsById || {})) {
    api.ensureDashboard(dashboard.id, dashboard.title, 'grid')
    api.setSelectedTable(dashboard.id, `"memory"."widgets"."d_${dashboard.id.replaceAll('-', '_')}"`)
    const byId = Object.fromEntries(dashboard.panels.map(panel => [panel.id, panel]))
    for (const panelId of dashboard.panelOrder) api.addPanel(dashboard.id, byId[panelId])
  }
}
