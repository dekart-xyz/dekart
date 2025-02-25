import { combineReducers } from 'redux'
import { Query, QueryJob } from '../../proto/dekart_pb'
import { downloadDataset } from '../actions/dataset'
import { closeQueryParamSettings, openQueryParamSettings, queryChanged, queryParamChanged, querySource, setQueryParamsValues, setQueryParamValue, updateQueryParamsFromQueries } from '../actions/query'
import { openReport, reportUpdate } from '../actions/report'
import { ActionTypes as KeplerActionTypes } from '@dekart-xyz/kepler.gl/dist/actions'

export function queries (state = [], action) {
  switch (action.type) {
    case openReport.name:
      return []
    case reportUpdate.name:
      return action.queriesList
    default:
      return state
  }
}

export function numRunningQueries (state = 0, action) {
  switch (action.type) {
    case openReport.name:
      return 0
    case reportUpdate.name:
      return action.queryJobsList.filter(job => job.queryParamsHash === action.hash).reduce((loadingNumber, q) => {
        switch (q.jobStatus) {
          case QueryJob.JobStatus.JOB_STATUS_PENDING:
          case QueryJob.JobStatus.JOB_STATUS_RUNNING:
          case QueryJob.JobStatus.JOB_STATUS_READING_RESULTS:
            return loadingNumber + 1
          default:
            return loadingNumber
        }
      }, 0)
    default:
      return state
  }
}

export function queryJobs (state = [], action) {
  switch (action.type) {
    case openReport.name:
      return []
    case reportUpdate.name:
      return action.queryJobsList
    default:
      return state
  }
}

export function queryStatus (state = {}, action) {
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
                changed: false,
                downloadingSource: false
              }
            }
          } else {
            // query text changed since last saved
            return {
              ...state,
              [action.queryId]: {
                ...state[action.queryId],
                downloadingSource: false
              }
            }
          }
        } else {
          // update query text from remote state
          return {
            ...state,
            [action.queryId]: {
              ...state[action.queryId],
              queryText: action.queryText,
              downloadingSource: false
            }
          }
        }
      }
      return state
    case reportUpdate.name:
      return action.queriesList.reduce(function (queryStatus, query) {
        const queryJob = action.queryJobsList.find(job => job.queryId === query.id && job.queryParamsHash === action.hash)
        queryStatus[query.id] = {
          // can run if no job or job is done
          canRun: queryJob ? [QueryJob.JobStatus.JOB_STATUS_UNSPECIFIED, QueryJob.JobStatus.JOB_STATUS_DONE, QueryJob.JobStatus.JOB_STATUS_DONE_LEGACY].includes(queryJob.jobStatus) : true,
          downloadingResults: false,
          querySourceId: query.querySourceId,
          querySource: query.querySource,
          downloadingSource: !state[query.id] // adding query first time
        }
        const wasChanged = state[query.id] ? state[query.id].changed : false
        if (query.querySource === Query.QuerySource.QUERY_SOURCE_INLINE) {
          // if it was not changed query will update to remote state
          // otherwise compare remote state to local state
          const changed = wasChanged ? state[query.id].queryText !== query.queryText : false
          const queryText = wasChanged ? state[query.id].queryText : query.queryText
          Object.assign(queryStatus[query.id], {
            changed,
            queryText,
            downloadingSource: false
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

// query parameters

function queryParamsValues (state = {}, action) {
  switch (action.type) {
    case setQueryParamsValues.name:
      return action.values
    case setQueryParamValue.name:
      return {
        ...state,
        [action.name]: action.value
      }
    default:
      return state
  }
}

function queryParamsUrl (state = '', action) {
  switch (action.type) {
    case setQueryParamsValues.name:
      return action.url
    default:
      return state
  }
}

function queryParamsModal (state = null, action) {
  switch (action.type) {
    case openQueryParamSettings.name:
      return action.name
    case closeQueryParamSettings.name:
      return null
    case queryParamChanged.name:
      return null
    default:
      return state
  }
}

function queryParamsList (state = [], action) {
  switch (action.type) {
    case queryParamChanged.name:
      return state.slice()
    case openReport.name:
      return []
    case reportUpdate.name:
      return structuredClone(action.report.queryParamsList)
    case updateQueryParamsFromQueries.name:
      return action.queryParamsList
    default:
      return state
  }
}

const emptyStringHash = 'd41d8cd98f00b204e9800998ecf8427e'

function queryParamsHash (state = emptyStringHash, action) {
  switch (action.type) {
    case setQueryParamsValues.name:
      return action.hash
    default:
      return state
  }
}

export const queryParams = combineReducers({
  list: queryParamsList,
  values: queryParamsValues,
  modal: queryParamsModal,
  url: queryParamsUrl,
  hash: queryParamsHash
})
