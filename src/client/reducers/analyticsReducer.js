import { combineReducers } from 'redux'
import { setAnalyticsData, setAnalyticsModalOpen } from '../actions/analytics'
import { closeReport, openReport } from '../actions/report'

function data (state = null, action) {
  switch (action.type) {
    case openReport.name:
    case closeReport.name:
      return null
    case setAnalyticsData.name:
      return action.data
    default:
      return state
  }
}

function modalOpen (state = false, action) {
  switch (action.type) {
    case setAnalyticsModalOpen.name:
      return action.modalOpen
    default:
      return state
  }
}

export default combineReducers({
  modalOpen,
  data
})
