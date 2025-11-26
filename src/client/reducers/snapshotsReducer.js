import { combineReducers } from 'redux'
import { closeReport, openReport } from '../actions/report'
import { getSnapshots, setSnapshotsData, setSnapshotsLoading } from '../actions/snapshots'

function data (state = null, action) {
  switch (action.type) {
    case openReport.name:
    case closeReport.name:
      return null
    case setSnapshotsData.name:
      return action.data
    default:
      return state
  }
}

function loading (state = false, action) {
  switch (action.type) {
    case openReport.name:
    case closeReport.name:
      return false
    case getSnapshots.name:
      return true
    case setSnapshotsLoading.name:
      return action.loading
    default:
      return state
  }
}

export default combineReducers({
  data,
  loading
})


