import { combineReducers } from 'redux'
import keplerGlReducer from 'kepler.gl/reducers'
import { ActionTypes as KeplerActionTypes } from 'kepler.gl/actions'
import { downloadJobResults, openReport, reportUpdate, runQuery, updateQuery } from './actions'
import { Query } from '../proto/dekart_pb'

const customKeplerGlReducer = keplerGlReducer.initialState({
  uiState: {
    currentModal: null
    // activeSidePanel: null
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

function queryStatus (state = {}, action) {
  let queryId
  switch (action.type) {
    case KeplerActionTypes.ADD_DATA_TO_MAP:
      queryId = action.payload.datasets.info.id
      return {
        ...state,
        [queryId]: {
          ...state[queryId],
          downloadingResults: false
        }
      }
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
    case reportUpdate.name:
      return action.queriesList.reduce(function (queryStatus, query) {
        queryStatus[query.id] = {
          canRun: [Query.JobStatus.JOB_STATUS_UNSPECIFIED, Query.JobStatus.JOB_STATUS_DONE].includes(query.jobStatus),
          downloadingResults: false
        }
        return queryStatus
      }, {})
    default:
      return state
  }
}

export default combineReducers({
  keplerGl,
  report,
  queries,
  queryStatus
})
