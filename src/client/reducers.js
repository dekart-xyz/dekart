import { combineReducers } from 'redux'
import keplerGlReducer from '@dekart-xyz/kepler.gl/dist/reducers'
import { ActionTypes as KeplerActionTypes } from '@dekart-xyz/kepler.gl/dist/actions'
import { downloadJobResults, openReport, reportTitleChange, reportUpdate, runQuery, saveMap, updateQuery, reportsListUpdate, unsubscribeReports, streamError, httpError, newReport, setEnv, forkReport, newForkedReport, downloading, finishDownloading, setActiveQuery, queryChanged, newRelease } from './actions'
import { Query } from '../proto/dekart_pb'

const customKeplerGlReducer = keplerGlReducer.initialState({
  uiState: {
    currentModal: null,
    activeSidePanel: null
  }
})

function keplerGl (state, action) {
  // console.log('keplerGl', state)
  // console.log('keplerGl', action)
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
    case downloadJobResults.name:
      return {
        ...state,
        size: 0
      }
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
  let queryId
  switch (action.type) {
    case KeplerActionTypes.ADD_DATA_TO_MAP:
      if (action.payload.datasets && action.payload.datasets.info) {
        queryId = action.payload.datasets.info.id
        return {
          ...state,
          [queryId]: {
            ...state[queryId],
            downloadingResults: false
          }
        }
      }
      return state
    case downloadJobResults.name:
      return {
        ...state,
        [action.query.id]: {
          ...state[action.query.id],
          downloadingResults: true
        }
      }

    case runQuery.name:
    case updateQuery.name:
      return {
        ...state,
        [action.queryId]: {
          ...state[action.queryId],
          canRun: false
        }
      }
    case queryChanged.name:
      return {
        ...state,
        [action.queryId]: {
          ...state[action.queryId],
          changed: action.changed,
          queryText: action.queryText
        }
      }
    case reportUpdate.name:
      return action.queriesList.reduce(function (queryStatus, query) {
        const wasChanged = state[query.id] ? state[query.id].changed : false
        // if it was not changed query will update to remote state
        // otherwise compare remote state to local state
        const changed = wasChanged ? state[query.id].queryText !== query.queryText : false
        queryStatus[query.id] = {
          canRun: [Query.JobStatus.JOB_STATUS_UNSPECIFIED, Query.JobStatus.JOB_STATUS_DONE].includes(query.jobStatus),
          downloadingResults: false,
          changed,
          // update to remote state only if it was not locally changed
          queryText: wasChanged ? state[query.id].queryText : query.queryText,
          querySourceId: query.querySourceId,
          querySource: query.querySource
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
        reports: action.reportsList.filter(report => !report.archived),
        archived: action.reportsList.filter(report => report.archived)
      }
    default:
      return state
  }
}

const defaultEnv = { loaded: false, variables: {} }
function env (state = defaultEnv, action) {
  switch (action.type) {
    case setEnv.name:
      return {
        loaded: true,
        variables: action.variables
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

function downloadingQueryResults (state = [], action) {
  const { query } = action
  switch (action.type) {
    case downloading.name:
      return state.concat(query)
    case finishDownloading.name:
      return state.filter(q => q.id !== query.id)
    default:
      return state
  }
}

function activeQuery (state = null, action) {
  const { queriesList, prevQueriesList } = action
  switch (action.type) {
    case openReport.name:
      return null
    case setActiveQuery.name:
      return action.query
    case reportUpdate.name:
      if (!state) {
        return queriesList[0] || state
      }
      if (queriesList.length > prevQueriesList.length) {
        return queriesList.slice(-1)[0]
      }
      return {
        ...(queriesList.find(q => q.id === state.id) || queriesList[0])
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

export default combineReducers({
  keplerGl,
  report,
  queries,
  queryStatus,
  activeQuery,
  reportStatus,
  reportsList,
  env,
  httpErrorStatus,
  downloadingQueryResults,
  release
})
