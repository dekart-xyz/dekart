import { CancelQueryRequest, CreateQueryRequest, RunQueryRequest } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { get } from '../lib/api'
import { unary } from '../lib/grpc'
import { error } from './message'

export function queryChanged (queryId, queryText) {
  return (dispatch, getState) => {
    const query = getState().queries.find(q => q.id === queryId)
    const changed = query ? query.queryText !== queryText : true
    dispatch({ type: queryChanged.name, queryText, queryId, changed })
  }
}

export function createQuery (datasetId) {
  return (dispatch) => {
    dispatch({ type: createQuery.name })
    const request = new CreateQueryRequest()
    request.setDatasetId(datasetId)
    unary(Dekart.CreateQuery, request).catch(err => dispatch(error(err)))
  }
}

export function runQuery (queryId, queryText) {
  return async (dispatch) => {
    dispatch({ type: runQuery.name, queryId })
    const request = new RunQueryRequest()
    request.setQueryId(queryId)
    request.setQueryText(queryText)
    try {
      await unary(Dekart.RunQuery, request)
    } catch (err) {
      dispatch(error(err))
    }
  }
}

export function cancelQuery (queryId) {
  return async (dispatch) => {
    dispatch({ type: cancelQuery.name, queryId })
    const request = new CancelQueryRequest()
    request.setQueryId(queryId)
    try {
      await unary(Dekart.CancelQuery, request)
    } catch (err) {
      dispatch(error(err))
    }
  }
}

export function querySource (queryId, querySourceId, queryText) {
  return { type: querySource.name, queryText, querySourceId, queryId }
}

export function downloadQuerySource (query) {
  return async (dispatch, getState) => {
    dispatch({ type: downloadQuerySource.name, query })
    const { queries } = getState()
    const i = queries.findIndex(q => q.id === query.id)
    if (i < 0) {
      return
    }
    try {
      const res = await get(`/query-source/${query.querySourceId}.sql`)
      const queryText = await res.text()
      dispatch(querySource(query.id, query.querySourceId, queryText))
    } catch (err) {
      dispatch(error(err))
    }
  }
}
