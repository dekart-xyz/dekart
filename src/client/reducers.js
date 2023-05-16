import { combineReducers } from 'redux'
import keplerGlReducer from '@dekart-xyz/kepler.gl/dist/reducers'
import { ActionTypes as KeplerActionTypes } from '@dekart-xyz/kepler.gl/dist/actions'
import { openReport, reportTitleChange, reportUpdate, saveMap, reportsListUpdate, unsubscribeReports, streamError, httpError, newReport, setEnv, forkReport, newForkedReport, downloading, finishDownloading, setActiveDataset, queryChanged, newRelease, querySource, uploadFile, uploadFileProgress, uploadFileStateChange, downloadDataset } from './actions'
import { Query } from '../proto/dekart_pb'
import { setUsage } from './actions/usage'
import { setUserMapboxAccessTokenUpdater } from '@dekart-xyz/kepler.gl/dist/reducers/ui-state-updaters'

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
    case streamError.name:
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
function queryStatus (state = {}, action) {
  switch (action.type) {
    case KeplerActionTypes.ADD_DATA_TO_MAP:
      if (action.payload.datasets && action.payload.datasets.info) {
        const datasetId = action.payload.datasets.info.id
        const queryId = Object.keys(state).find((queryId) => datasetId === state[queryId].datasetId)
        return {
          ...state,
          [queryId]: {
            ...state[queryId],
            downloadingResults: false
          }
        }
      }
      return state
    case downloadDataset.name:
      return action.dataset.queryId
        ? {
            ...state,
            [action.dataset.queryId]: {
              ...state[action.dataset.queryId],
              downloadingResults: true,
              datasetId: action.dataset.id
            }
          }
        : state
    case queryChanged.name:
      return {
        ...state,
        [action.queryId]: {
          ...state[action.queryId],
          changed: action.changed,
          queryText: action.queryText
        }
      }
    case querySource.name:
      if (
        state[action.queryId] &&
        state[action.queryId].querySourceId === action.querySourceId
      ) {
        if (state[action.queryId].changed) {
          if (action.queryText === state[action.queryId].queryText) {
            return {
              ...state,
              [action.queryId]: {
                ...state[action.queryId],
                changed: false
              }
            }
          } else {
            // query text changed since last saved
            return state
          }
        } else {
          return {
            ...state,
            [action.queryId]: {
              ...state[action.queryId],
              queryText: action.queryText
            }
          }
        }
      }
      return state
    case reportUpdate.name:
      return action.queriesList.reduce(function (queryStatus, query) {
        queryStatus[query.id] = {
          canRun: [Query.JobStatus.JOB_STATUS_UNSPECIFIED, Query.JobStatus.JOB_STATUS_DONE, Query.JobStatus.JOB_STATUS_DONE_LEGACY].includes(query.jobStatus),
          downloadingResults: false,
          querySourceId: query.querySourceId,
          querySource: query.querySource
        }
        const wasChanged = state[query.id] ? state[query.id].changed : false
        if (query.querySource === Query.QuerySource.QUERY_SOURCE_INLINE) {
          // if it was not changed query will update to remote state
          // otherwise compare remote state to local state
          const changed = wasChanged ? state[query.id].queryText !== query.queryText : false
          const queryText = wasChanged ? state[query.id].queryText : query.queryText
          Object.assign(queryStatus[query.id], {
            changed,
            queryText
          })
        } else {
          Object.assign(queryStatus[query.id], {
            changed: wasChanged,
            queryText: state[query.id] ? state[query.id].queryText : ''
          })
        }
        return queryStatus
      }, {})
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
        my: action.reportsList.filter(report => !report.archived && report.canWrite),
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
        authEnabled: action.variables.REQUIRE_AMAZON_OIDC === '1' || action.variables.REQUIRE_IAP === '1',
        authType: action.variables.REQUIRE_IAP === '1' ? 'IAP' : action.variables.REQUIRE_AMAZON_OIDC ? 'AMAZON_OIDC' : 'NONE'
      }
    default:
      return state
  }
}

function httpErrorStatus (state = 0, action) {
  switch (action.type) {
    case httpError.name:
      return action.status
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

export default combineReducers({
  keplerGl,
  report,
  queries,
  queryStatus,
  activeDataset,
  reportStatus,
  reportsList,
  env,
  httpErrorStatus,
  downloadingDatasets,
  release,
  datasets,
  files,
  fileUploadStatus,
  usage
})
