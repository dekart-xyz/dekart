// REVIEW: Track parsed widget configuration, local revisions, saved baselines, report versions, and remote conflicts in serializable Redux state.
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

// Keep serializable authored widgets in Redux; live SQLRooms selections stay in its runtime.
export default function widgets (state = initial, action) {
  switch (action.type) {
    case 'openReport':
    case 'closeReport': return initial
    case 'widgetsChanged': return { ...state, config: action.config, raw: JSON.stringify(action.config), revision: state.revision + 1 }
    case 'savedReport': return { ...state, savedRaw: action.widgetRaw ?? state.savedRaw, savedRevision: action.widgetRevision ?? state.savedRevision, versionId: action.versionId, conflict: false }
    case 'reportUpdate': {
      if (action.report.versionId === state.versionId) return state
      const incoming = parseWidgetsConfig(action.report.widgetsConfig)
      if (state.revision > state.savedRevision) {
        // Query and dataset writes rotate the report version without changing the saved dashboard.
        if (sameConfig(incoming.raw, state.raw) || sameConfig(incoming.raw, state.savedRaw)) return { ...state, savedRaw: incoming.raw, versionId: action.report.versionId, conflict: false }
        return { ...state, conflict: true }
      }
      return { ...state, ...incoming, savedRaw: incoming.raw, versionId: action.report.versionId, conflict: false }
    }
    default: return state
  }
}
