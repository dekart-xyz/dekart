import { combineReducers } from 'redux'
import { closeDatasetSettingsModal, keplerDatasetFinishUpdating, keplerDatasetStartUpdating, openDatasetSettingsModal, setActiveDataset } from '../actions/dataset'
import { downloading as downloadingAction, finishDownloading } from '../actions/message'
import { openReport, reportUpdate } from '../actions/report'

function downloading (state = [], action) {
  const { dataset } = action
  switch (action.type) {
    case downloadingAction.name:
      return state.concat(dataset)
    case finishDownloading.name:
      return state.filter(d => d.id !== dataset.id)
    default:
      return state
  }
}

function active (state = null, action) {
  const { datasetsList, prevDatasetsList } = action
  switch (action.type) {
    case openReport.name:
      return null
    case setActiveDataset.name:
      return action.dataset
    case reportUpdate.name:
      if (!state) {
        return datasetsList[0] || state
      }
      if (datasetsList.length > prevDatasetsList.length) {
        return datasetsList.slice(-1)[0]
      }
      return {
        ...(datasetsList.find(d => d.id === state.id) || datasetsList[0])
      }
    default:
      return state
  }
}

function list (state = [], action) {
  switch (action.type) {
    case openReport.name:
      return []
    case reportUpdate.name:
      return action.datasetsList
    default:
      return state
  }
}

function settings (state = { datasetId: null, visible: false }, action) {
  switch (action.type) {
    case openDatasetSettingsModal.name:
      return {
        datasetId: action.datasetId,
        visible: true
      }
    case closeDatasetSettingsModal.name:
      return {
        datasetId: null,
        visible: false
      }
    default:
      return state
  }
}

// Number of datasets that are currently updating on kepler
function updatingNum (state = 0, action) {
  switch (action.type) {
    case keplerDatasetStartUpdating.name:
      return state + 1
    case keplerDatasetFinishUpdating.name:
      return state - 1
    default:
      return state
  }
}

export default combineReducers({
  downloading,
  active,
  settings,
  list,
  updatingNum
})
