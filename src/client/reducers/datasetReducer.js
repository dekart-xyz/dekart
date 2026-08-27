import { combineReducers } from 'redux'
import { addDatasetToMap, cancelDownloading, closeDatasetSettingsModal, downloadDataset, downloadingProgress, finishAddingDatasetToMap, finishDownloading, openDatasetSettingsModal, processDownloadError, setActiveDataset } from '../actions/dataset'
import { keplerDatasetFinishUpdating, keplerDatasetStartUpdating } from '../actions/kepler'
import { closeReport, openReport, reportUpdate } from '../actions/report'

function lastAddedQueryParamsHash (state = {}, action) {
  switch (action.type) {
    case addDatasetToMap.name:
      if (action.dataset.queryId) {
        return {
          ...state,
          [action.dataset.queryId]: action.queryParamsHash
        }
      }
      return state
    case openReport.name:
    case closeReport.name:
      return {}
    default:
      return state
  }
}

function lastAddedQueryQueryJob (state = {}, action) {
  switch (action.type) {
    case addDatasetToMap.name:
      if (action.dataset.queryId) {
        return {
          ...state,
          [action.dataset.queryId]: action.queryJob
        }
      }
      return state
    case openReport.name:
    case closeReport.name:
      return {}
    default:
      return state
  }
}

function downloading (state = [], action) {
  const matchesDownload = d => d.controller === action.controller
  switch (action.type) {
    case downloadDataset.name:
      return state.filter(d => d.dataset.id !== action.dataset.id).concat({
        dataset: action.dataset,
        controller: action.controller,
        sourceId: action.sourceId,
        loaded: 0
      })
    case downloadingProgress.name:
      return state.map(d => {
        if (matchesDownload(d)) {
          return {
            ...d,
            loaded: action.loaded
          }
        }
        return d
      })
    case openReport.name:
    case cancelDownloading.name:
      return []
    case addDatasetToMap.name:
      return state.map(d => {
        if (matchesDownload(d)) {
          return {
            ...d,
            addingToMap: true
          }
        }
        return d
      })
    case finishDownloading.name:
      return state.map(d => {
        if (matchesDownload(d)) {
          return {
            ...d,
            res: action.res,
            extension: action.extension,
            label: action.label,
            prevDatasetsList: action.prevDatasetsList
          }
        }
        return d
      })
    case finishAddingDatasetToMap.name: // dataset added to map, remove from downloading list
    case processDownloadError.name: // error occurred, remove from downloading list
      return state.filter(d => !matchesDownload(d))
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
        if (datasetsList.length > 1) {
          const newDataset = datasetsList.find(d => !(d.queryId || d.fileId))
          if (newDataset) {
            return newDataset
          }
        }
        return datasetsList[0] || state
      }
      if (datasetsList.length > prevDatasetsList.length) {
        return datasetsList.slice(-1)[0]
      }
      return datasetsList.find(d => d.id === state.id) || datasetsList[0] || null
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
  updatingNum,
  lastAddedQueryParamsHash,
  lastAddedQueryQueryJob
})
