// REVIEW: Track parsed widget configuration, local revisions, saved baselines, report versions, and remote conflicts in serializable Redux state.
import { closeReport, openReport, reportUpdate, savedReport } from '../actions/report'
import { widgetsChanged } from '../actions/widgets'
import { parseWidgetsConfig } from '../widgets/widgetsConfig'
import { deepCompare } from '../lib/deepCompare'

const initialConfig = parseWidgetsConfig('')
const initial = { ...initialConfig, savedRaw: initialConfig.raw, revision: 0, savedRevision: 0, versionId: null, conflict: false }

function sameConfig (left, right) {
  if (left === right) return true
  try {
    return deepCompare(JSON.parse(left), JSON.parse(right))
  } catch (_) {
    return false
  }
}

function removeDatasetDashboards (widgets, datasetIds) {
  if (!datasetIds?.length) return widgets
  const dashboards = widgets.config?.config?.dashboardsById
  if (!dashboards || !datasetIds.some(datasetId => dashboards[datasetId])) return widgets
  const dashboardsById = { ...dashboards }
  datasetIds.forEach(datasetId => delete dashboardsById[datasetId])
  const config = { ...widgets.config, config: { ...widgets.config.config, dashboardsById } }
  return { ...widgets, config, raw: JSON.stringify(config) }
}

// Keep serializable authored widgets in Redux; live SQLRooms selections stay in its runtime.
export default function widgets (state = initial, action) {
  switch (action.type) {
    case openReport.name:
    case closeReport.name: return initial
    case widgetsChanged.name: return { ...state, config: action.config, raw: JSON.stringify(action.config), revision: state.revision + 1 }
    case savedReport.name:
      if (state.versionId !== action.expectedVersionId && state.versionId !== action.versionId) {
        return { ...state, savedRevision: Math.max(state.savedRevision, action.widgetRevision ?? state.savedRevision) }
      }
      return { ...state, savedRaw: action.widgetRaw ?? state.savedRaw, savedRevision: action.widgetRevision ?? state.savedRevision, versionId: action.versionId, conflict: false }
    case reportUpdate.name: {
      const current = removeDatasetDashboards(state, action.removedDatasetIds)
      if (action.report.versionId === current.versionId) return current
      const incoming = parseWidgetsConfig(action.report.widgetsConfig)
      const saved = removeDatasetDashboards(parseWidgetsConfig(current.savedRaw), action.removedDatasetIds)
      if (current.revision > current.savedRevision) {
        // Query and dataset writes rotate the report version without changing the saved dashboard.
        if (sameConfig(incoming.raw, current.raw) || sameConfig(incoming.raw, saved.raw)) return { ...current, savedRaw: incoming.raw, versionId: action.report.versionId, conflict: false }
        return { ...current, conflict: true }
      }
      return { ...current, ...incoming, savedRaw: incoming.raw, versionId: action.report.versionId, conflict: false }
    }
    default: return state
  }
}
