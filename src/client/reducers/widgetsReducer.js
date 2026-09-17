import { parseWidgetsConfig } from '../widgets/widgetsConfig'

const initial = { config: null, raw: '', savedRaw: '', compatibility: 'supported', revision: 0, savedRevision: 0, versionId: null, conflict: false }

// Keep serializable authored widgets in Redux; live SQLRooms selections stay in its runtime.
export default function widgets (state = initial, action) {
  switch (action.type) {
    case 'openReport':
    case 'closeReport': return initial
    case 'widgetsChanged': return { ...state, config: action.config, raw: JSON.stringify(action.config), compatibility: 'supported', revision: state.revision + 1 }
    case 'savedReport': return { ...state, savedRaw: action.widgetRaw ?? state.savedRaw, savedRevision: action.widgetRevision ?? state.savedRevision, versionId: action.versionId, conflict: false }
    case 'reportUpdate': {
      if (action.report.versionId === state.versionId) return state
      if (state.revision > state.savedRevision) {
        // Query and dataset writes rotate the report version without changing the saved dashboard.
        if (action.report.widgetsConfig === state.raw || action.report.widgetsConfig === state.savedRaw) return { ...state, savedRaw: action.report.widgetsConfig, versionId: action.report.versionId, conflict: false }
        return { ...state, conflict: true }
      }
      return { ...state, ...parseWidgetsConfig(action.report.widgetsConfig), savedRaw: action.report.widgetsConfig, versionId: action.report.versionId, conflict: false }
    }
    default: return state
  }
}
