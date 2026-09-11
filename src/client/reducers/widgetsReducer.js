const initial = { config: null, revision: 0, savedRevision: 0, versionId: null, conflict: false }

// Keep serializable authored widgets in Redux; live SQLRooms selections stay in its runtime.
export default function widgets (state = initial, action) {
  switch (action.type) {
    case 'openReport':
    case 'closeReport': return initial
    case 'widgetsChanged': return { ...state, config: action.config, revision: state.revision + 1 }
    case 'savedReport': return { ...state, savedRevision: action.widgetRevision ?? state.savedRevision, versionId: action.versionId, conflict: false }
    case 'reportUpdate': {
      if (action.report.versionId === state.versionId) return state
      if (state.revision > state.savedRevision) return { ...state, conflict: true }
      return { ...state, config: action.report.widgetsConfig ? JSON.parse(action.report.widgetsConfig) : null, versionId: action.report.versionId }
    }
    default: return state
  }
}
