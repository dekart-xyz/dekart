import { Query } from '../../proto/dekart_pb'
import { downloadDataset } from '../actions/dataset'
import { queryChanged, querySource } from '../actions/query'
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
        queryStatus[query.id] = {
          canRun: [Query.JobStatus.JOB_STATUS_UNSPECIFIED, Query.JobStatus.JOB_STATUS_DONE, Query.JobStatus.JOB_STATUS_DONE_LEGACY].includes(query.jobStatus),
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
