import { combineReducers } from 'redux'
import { closeReport, openReport, restoreReportSnapshot, restoreReportSnapshotSuccess } from '../actions/report'
import { getSnapshots, setSnapshotsData, setSnapshotsLoading, toggleSnapshotModal } from '../actions/snapshots'

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

function restoring (state = false, action) {
  switch (action.type) {
    case restoreReportSnapshot.name:
      return true
    case restoreReportSnapshotSuccess.name:
      return false
    default:
      return state
  }
}

function open (state = false, action) {
  switch (action.type) {
    case restoreReportSnapshotSuccess.name:
      return false
    case toggleSnapshotModal.name:
      return action.open
    default:
      return state
  }
}
export default combineReducers({
  data,
  loading,
  restoring,
  open
})
