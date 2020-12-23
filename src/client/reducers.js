import { combineReducers } from 'redux'
import keplerGlReducer from 'kepler.gl/reducers'
import { openReport, reportUpdate } from './actions'

const customKeplerGlReducer = keplerGlReducer.initialState({
  uiState: {
    currentModal: null
    // activeSidePanel: null
  }
})

function keplerGl (state, action) {
  console.log('keplerGl', state)
  return customKeplerGlReducer(state, action)
}

function report (state = null, action) {
  switch (action.type) {
    case openReport.name:
      return null
    case reportUpdate.name:
      return action.report
    default:
      return state
  }
}

function queries (state = [], action) {
  switch (action.type) {
    case openReport.name:
      return []
    case reportUpdate.name:
      return action.queriesList
    default:
      return state
  }
}

export default combineReducers({
  keplerGl,
  report,
  queries
})
