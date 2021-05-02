import { CancelQueryRequest, CreateQueryRequest, Query, RunQueryRequest, UpdateQueryRequest } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { unary } from '../lib/grpc'
import { error, success } from './message'

export function removeQuery (queryId) {
  return { type: removeQuery.name, queryId }
}

export function createQuery (reportId) {
  return (dispatch) => {
    dispatch({ type: createQuery.name })
    const request = new CreateQueryRequest()
    const query = new Query()
    query.setReportId(reportId)
    request.setQuery(query)
    unary(Dekart.CreateQuery, request).catch(err => dispatch(error(err)))
  }
}

export function updateQuery (queryId, queryText) {
  return async (dispatch) => {
    dispatch({ type: updateQuery.name, queryId })
    const request = new UpdateQueryRequest()
    const query = new Query()
    query.setId(queryId)
    query.setQueryText(queryText)
    request.setQuery(query)
    try {
      await unary(Dekart.UpdateQuery, request)
      dispatch(success('Query Saved'))
    } catch (err) {
      dispatch(error(err))
      throw error
    }
  }
}
export function runQuery (queryId, queryText) {
  return async (dispatch) => {
    await updateQuery(queryId, queryText)(dispatch)
    dispatch({ type: runQuery.name, queryId })
    const request = new RunQueryRequest()
    request.setQueryId(queryId)
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
