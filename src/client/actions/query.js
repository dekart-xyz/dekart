import { CancelQueryRequest, CreateQueryRequest, Query, RemoveQueryRequest, RunQueryRequest, UpdateQueryRequest } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { unary } from '../lib/grpc'
import { error, success } from './message'

export function queryChanged (queryId, queryText) {
  return (dispatch, getState) => {
    const query = getState().queries.find(q => q.id === queryId)
    const changed = query ? query.queryText !== queryText : true
    dispatch({ type: queryChanged.name, queryText, queryId, changed })
  }
}

export function setActiveQuery (queryId) {
  return (dispatch, getState) => {
    const { queries } = getState()
    const query = queries.find(q => q.id === queryId) || queries[0]
    if (query) {
      dispatch({ type: setActiveQuery.name, query })
    }
  }
}
export function removeQuery (queryId) {
  return async (dispatch, getState) => {
    const { queries, activeQuery } = getState()
    if (activeQuery.id === queryId) {
      // removed active query
      const queriesLeft = queries.filter(q => q.id !== queryId)
      if (queriesLeft.length === 0) {
        dispatch(error(new Error('Cannot remove last query')))
        return
      }
      dispatch(setActiveQuery(queriesLeft.id))
    }
    dispatch({ type: removeQuery.name, queryId })

    const request = new RemoveQueryRequest()
    request.setQueryId(queryId)
    try {
      await unary(Dekart.RemoveQuery, request)
      dispatch(success('Query Removed'))
    } catch (err) {
      dispatch(error(err))
    }
  }
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
