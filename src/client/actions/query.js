import { CancelJobRequest, CreateQueryRequest, QueryExecutionEngine, QueryParam, RunAllQueriesRequest, RunDuckDBQueryRequest, RunQueryRequest } from 'dekart-proto/dekart_pb'
import { Dekart } from 'dekart-proto/dekart_pb_service'
import { get } from '../lib/api'
import { getQueryParamsHash, getQueryParamsObjArr, getQueryParamsString, getQueryParamsValuesFromSearch, normalizeQueryParamsValues } from '../lib/queryParams'
import { grpcCall } from './grpc'
import { setError } from './message'

let runAllQueriesGeneration = 0

export function queryChanged (queryId, queryText) {
  return (dispatch, getState) => {
    const query = getState().queries.find(q => q.id === queryId)
    const changed = query ? query.queryText !== queryText : true
    dispatch({ type: queryChanged.name, queryText, queryId, changed })
    dispatch(updateQueryParamsFromQueries())
  }
}

// parses query for {{name}} parameters and returns them as an array
function getParameterNamesFromQuery (queryText) {
  const matches = queryText.match(/{{\w+}}/g)
  return matches ? matches.map(match => match.slice(2, -2)) : []
}

function getQueryParamsFromQuery (queryParams, queryText) {
  const queryParamNames = getParameterNamesFromQuery(queryText)
  const qp = []
  queryParamNames.forEach(name => {
    const existingParam = queryParams.find(param => param.name === name)
    const addedParam = qp.find(param => param.name === name)
    if (existingParam && !addedParam) {
      qp.push(existingParam)
      return
    }
    if (!addedParam) {
      qp.push({
        name,
        type: QueryParam.Type.TYPE_STRING,
        defaultValue: ''
      })
    }
  })
  return qp
}

export function updateQueryParamsFromQueries () {
  return async function (dispatch, getState) {
    const { queryStatus, queryParams } = getState()
    const allText = Object.keys(queryStatus).map(k => queryStatus[k].queryText).join('')
    const queryParamsList = getQueryParamsFromQuery(queryParams.list, allText)
    dispatch({ type: updateQueryParamsFromQueries.name, queryParamsList })
  }
}

export function createQuery (datasetId, connectionId = '', executionEngine = QueryExecutionEngine.QUERY_EXECUTION_ENGINE_CONNECTION) {
  return (dispatch) => {
    dispatch({ type: createQuery.name })
    const request = new CreateQueryRequest()
    request.setDatasetId(datasetId)
    request.setConnectionId(connectionId)
    request.setExecutionEngine(executionEngine)
    dispatch(grpcCall(Dekart.CreateQuery, request))
  }
}

// runWarehouseQuery executes a connection-backed query through the warehouse service.
export function runWarehouseQuery (queryId, queryText) {
  return async (dispatch, getState) => {
    const { queryParams } = getState()
    const previousJob = getState().queryJobs.find(job =>
      job.queryId === queryId &&
      job.queryParamsHash === queryParams.hash
    )
    dispatch(queryExecutionStarted(queryId, queryParams.hash, previousJob?.id || ''))
    const request = new RunQueryRequest()
    request.setQueryId(queryId)
    request.setQueryText(queryText)
    request.setQueryParamsList(getQueryParamsObjArr(queryParams.list))
    request.setQueryParamsValues(queryParams.url)
    await dispatch(grpcCall(Dekart.RunQuery, request, undefined, err => {
      dispatch(queryExecutionRejected(queryId))
      return err
    }))
  }
}

// runDuckDBQuery sends one versioned command and leaves canonical state to the report stream.
export function runDuckDBQuery (queryId, queryText) {
  return async (dispatch, getState) => {
    const { queryParams } = getState()
    const query = getState().queries.find(query => query.id === queryId)
    const currentJob = getState().queryJobs.find(job =>
      job.queryId === queryId && job.queryParamsHash === queryParams.hash
    )
    const observedJobId = currentJob?.id || ''
    dispatch(queryExecutionStarted(queryId, queryParams.hash, observedJobId))
    const request = new RunDuckDBQueryRequest()
    request.setQueryId(queryId)
    request.setQueryText(queryText)
    request.setQueryParamsValues(queryParams.url)
    request.setExpectedQuerySourceId(query?.querySourceId || '')
    await dispatch(grpcCall(Dekart.RunDuckDBQuery, request, undefined, err => {
      dispatch(queryExecutionRejected(queryId))
      return err
    }))
  }
}

export function queryExecutionStarted (queryId, queryParamsHash, observedJobId) {
  return { type: queryExecutionStarted.name, queryId, queryParamsHash, observedJobId }
}

export function queryExecutionRejected (queryId) {
  return { type: queryExecutionRejected.name, queryId }
}

export function runAllQueriesStarted (generation) {
  return { type: runAllQueriesStarted.name, generation }
}

export function runAllQueriesFinished (generation) {
  return { type: runAllQueriesFinished.name, generation }
}

export function runAllQueries () {
  return async (dispatch, getState) => {
    const reportId = getState().report.id
    const generation = ++runAllQueriesGeneration
    dispatch(runAllQueriesStarted(generation))
    try {
      const { queryParams } = getState()
      const request = new RunAllQueriesRequest()
      request.setReportId(reportId)
      request.setQueryParamsList(getQueryParamsObjArr(queryParams.list))
      request.setQueryParamsValues(queryParams.url)
      await dispatch(grpcCall(
        Dekart.RunAllQueries,
        request,
        undefined,
        error => getState().runAllQueriesPending === generation ? error : null
      ))
    } finally {
      dispatch(runAllQueriesFinished(generation))
    }
  }
}

// invalidateRunAllQueries prevents late unary failures from mutating a closed or replaced report.
export function invalidateRunAllQueries () {
  runAllQueriesGeneration++
  return { type: invalidateRunAllQueries.name }
}

export function cancelJob (jobId) {
  return async (dispatch) => {
    dispatch({ type: cancelJob.name, jobId })
    const request = new CancelJobRequest()
    request.setJobId(jobId)
    dispatch(grpcCall(Dekart.CancelJob, request))
  }
}

export function querySource (queryId, querySourceId, queryText) {
  return { type: querySource.name, queryText, querySourceId, queryId }
}

export function downloadQuerySource (query) {
  return async (dispatch, getState) => {
    dispatch({ type: downloadQuerySource.name, query })
    const { queries, token, report, user: { claimEmailCookie } } = getState()
    const i = queries.findIndex(q => q.id === query.id)
    if (i < 0) {
      return
    }
    try {
      const res = await get(
        `/query-source/${query.id}/${query.querySourceId}.sql`,
        token,
        null,
        null,
        claimEmailCookie,
        report?.id || ''
      )
      const queryText = await res.text()
      dispatch(querySource(query.id, query.querySourceId, queryText))
    } catch (err) {
      dispatch(setError(err))
    }
  }
}

export function openQueryParamSettings (name) {
  return { type: openQueryParamSettings.name, name }
}

export function closeQueryParamSettings () {
  return { type: closeQueryParamSettings.name }
}

export function queryParamChanged () {
  return { type: queryParamChanged.name }
}

export function setQueryParamValue (name, value) {
  return { type: setQueryParamValue.name, name, value }
}

export function updateQueryParamsFromURL (search) {
  return async function (dispatch) {
    dispatch(setQueryParamsValues(getQueryParamsValuesFromSearch(search)))
  }
}

export function applyQueryParams () {
  return async function (dispatch, getState) {
    const { queryParams: { values } } = getState()
    dispatch(setQueryParamsValues(values))
    dispatch(runAllQueries())
  }
}

export function setQueryParamsValues (valuesIn) {
  return async function (dispatch, getState) {
    const { queryParams } = getState()
    const values = normalizeQueryParamsValues(queryParams.list, valuesIn)
    const paramsStr = getQueryParamsString(queryParams.list, values)
    window.history.replaceState({}, '', `${window.location.pathname}?${paramsStr}`)

    const hash = getQueryParamsHash(queryParams.list, values)
    dispatch({ type: setQueryParamsValues.name, values, url: paramsStr, hash })
  }
}
