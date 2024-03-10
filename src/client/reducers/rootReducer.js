import { combineReducers } from 'redux'
import { ActionTypes as KeplerActionTypes } from '@dekart-xyz/kepler.gl/dist/actions'
import { setUserMapboxAccessTokenUpdater } from '@dekart-xyz/kepler.gl/dist/reducers/ui-state-updaters'
import { openReport, reportUpdate, forkReport, saveMap, reportTitleChange, newReport, newForkedReport, unsubscribeReports, reportsListUpdate } from '../actions/report'
import { downloading, finishDownloading, setStreamError } from '../actions/message'
import { closeDatasetSettingsModal, openDatasetSettingsModal, setActiveDataset } from '../actions/dataset'
import { queries, queryStatus } from './queryReducer'
import { setUsage } from '../actions/usage'
import { setEnv } from '../actions/env'
import { newRelease } from '../actions/version'
import { uploadFile, uploadFileProgress, uploadFileStateChange } from '../actions/file'
import keplerGlReducer from '@dekart-xyz/kepler.gl/dist/reducers'
import stream from './streamReducer'
import token from './tokenReducer'
import connection from './connectionReducer'
import user from './userReducer'
import httpError from './httpErrorReducer'

const customKeplerGlReducer = keplerGlReducer.initialState({
  uiState: {
    currentModal: null,
    activeSidePanel: null
  }
})

function keplerGl (state, action) {
  const newState = customKeplerGlReducer(state, action)
  switch (action.type) {
    case KeplerActionTypes.REGISTER_ENTRY:
      // set mapbox token for map export
      newState.kepler.uiState = setUserMapboxAccessTokenUpdater(newState.kepler.uiState, {
        payload: newState.kepler.mapStyle.mapboxApiAccessToken
      })
      return newState
    default:
      return newState
  }
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

function files (state = [], action) {
  switch (action.type) {
    case openReport.name:
      return []
    case reportUpdate.name:
      return action.filesList
    default:
      return state
  }
}

function datasets (state = [], action) {
  switch (action.type) {
    case openReport.name:
      return []
    case reportUpdate.name:
      return action.datasetsList
    default:
      return state
  }
}

const defaultReportStatus = {
  dataAdded: false,
  canSave: false,
  title: null,
  edit: false,
  online: false,
  newReportId: null,
  lastUpdated: 0
}
function reportStatus (state = defaultReportStatus, action) {
  switch (action.type) {
    case forkReport.name:
    case saveMap.name:
      return {
        ...state,
        canSave: false
      }
    case reportTitleChange.name:
      return {
        ...state,
        title: action.title
      }
    case reportUpdate.name:
      return {
        ...state,
        canSave: true,
        online: true,
        title: state.title == null ? action.report.title : state.title,
        lastUpdated: Date.now()
      }
    case openReport.name:
      return {
        ...defaultReportStatus,
        edit: action.edit
      }
    case setStreamError.name:
      return {
        ...state,
        online: false
      }
    case KeplerActionTypes.ADD_DATA_TO_MAP:
      return {
        ...state,
        dataAdded: true
      }
    case newReport.name:
    case newForkedReport.name:
      return {
        ...state,
        newReportId: action.id
      }
    default:
      return state
  }
}
const defaultReportsList = { loaded: false, reports: [] }
function reportsList (state = defaultReportsList, action) {
  switch (action.type) {
    case unsubscribeReports.name:
      return defaultReportsList
    case reportsListUpdate.name:
      return {
        ...state,
        loaded: true,
        my: action.reportsList.filter(report => !report.archived && report.isAuthor),
        archived: action.reportsList.filter(report => report.archived),
        discoverable: action.reportsList.filter(report => report.discoverable && !report.archived)
      }
    default:
      return state
  }
}

const defaultUsage = { loaded: false, stats: null }
function usage (state = defaultUsage, action) {
  switch (action.type) {
    case setUsage.name:
      return {
        loaded: true,
        stats: action.stats
      }
    default:
      return state
  }
}

const defaultEnv = { loaded: false, variables: {}, authEnabled: null, authType: 'UNSPECIFIED' }
function env (state = defaultEnv, action) {
  switch (action.type) {
    case setEnv.name:
      return {
        loaded: true,
        variables: action.variables,
        authEnabled: action.variables.REQUIRE_AMAZON_OIDC === '1' || action.variables.REQUIRE_IAP === '1' || action.variables.REQUIRE_GOOGLE_OAUTH === '1',
        authType: (
          action.variables.REQUIRE_IAP === '1'
            ? 'IAP'
            : action.variables.REQUIRE_AMAZON_OIDC
              ? 'AMAZON_OIDC'
              : action.variables.REQUIRE_GOOGLE_OAUTH
                ? 'GOOGLE_OAUTH'
                : 'NONE'
        ),
        needSensitiveScopes: action.variables.REQUIRE_GOOGLE_OAUTH
      }
    default:
      return state
  }
}

function downloadingDatasets (state = [], action) {
  const { dataset } = action
  switch (action.type) {
    case downloading.name:
      return state.concat(dataset)
    case finishDownloading.name:
      return state.filter(d => d.id !== dataset.id)
    default:
      return state
  }
}

function activeDataset (state = null, action) {
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

function release (state = null, action) {
  switch (action.type) {
    case newRelease.name:
      return action.release
    default:
      return state
  }
}

function fileUploadStatus (state = {}, action) {
  switch (action.type) {
    case uploadFile.name:
      return {
        ...state,
        [action.fileId]: {
          readyState: 0,
          loaded: 0,
          total: action.file.size,
          status: 0
        }
      }
    case uploadFileStateChange.name:
      return {
        ...state,
        [action.fileId]: {
          ...state[action.fileId],
          readyState: action.readyState,
          status: action.status
        }
      }
    case uploadFileProgress.name:
      return {
        ...state,
        [action.fileId]: {
          ...state[action.fileId],
          loaded: action.loaded
        }
      }
    default:
      return state
  }
}

function datasetSettings (state = { datasetId: null, visible: false }, action) {
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

export default combineReducers({
  keplerGl,
  report,
  queries,
  queryStatus,
  activeDataset,
  reportStatus,
  reportsList,
  env,
  httpError,
  downloadingDatasets,
  release,
  datasets,
  files,
  fileUploadStatus,
  usage,
  datasetSettings,
  connection,
  token,
  stream,
  user
})
