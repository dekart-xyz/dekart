import { CancelJobRequest, CreateQueryRequest, QueryParam, RunAllQueriesRequest, RunQueryRequest } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { get } from '../lib/api'
import { getQueryParamsObjArr, getQueryParamsString } from '../lib/queryParams'
import { grpcCall } from './grpc'
import { setError } from './message'
import { md5 } from 'js-md5'
import { saveMap } from './report'

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

export function createQuery (datasetId) {
  return (dispatch) => {
    dispatch({ type: createQuery.name })
    const request = new CreateQueryRequest()
    request.setDatasetId(datasetId)
    dispatch(grpcCall(Dekart.CreateQuery, request))
  }
}

export function runQuery (queryId, queryText) {
  return async (dispatch, getState) => {
    dispatch({ type: runQuery.name, queryId })
    const { queryParams } = getState()
    const request = new RunQueryRequest()
    request.setQueryId(queryId)
    request.setQueryText(queryText)
    request.setQueryParamsList(getQueryParamsObjArr(queryParams.list))
    request.setQueryParamsValues(queryParams.url)
    dispatch(grpcCall(Dekart.RunQuery, request))
  }
}

export function runAllQueries () {
  return async (dispatch, getState) => {
    const reportId = getState().report.id
    const { queryParams } = getState()
    const request = new RunAllQueriesRequest()
    request.setReportId(reportId)
    request.setQueryParamsList(getQueryParamsObjArr(queryParams.list))
    request.setQueryParamsValues(queryParams.url)
    dispatch(grpcCall(Dekart.RunAllQueries, request))
  }
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
    const { queries, token } = getState()
    const i = queries.findIndex(q => q.id === query.id)
    if (i < 0) {
      return
    }
    try {
      const res = await get(`/query-source/${query.id}/${query.querySourceId}.sql`, token)
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
    const params = new URLSearchParams(search)
    const values = {}
    params.forEach((value, key) => {
      if (key.startsWith('qp_')) {
        values[key.substring(3)] = value
      }
    })
    dispatch(setQueryParamsValues(values))
  }
}

// use first value from query params as default value if it is not set
function setDefaultValuesIfNeeded (queryParamsList, values) {
  let changed = false
  queryParamsList.forEach(param => {
    if (!param.defaultValue && values[param.name]) {
      param.defaultValue = values[param.name]
      changed = true
    }
  })
  return changed
}

export function applyQueryParams () {
  return async function (dispatch, getState) {
    const { queryParams: { values, list }, report: { canWrite } } = getState()
    const updateAndRunQueries = () => {
      dispatch(setQueryParamsValues(values))
      dispatch(runAllQueries())
    }

    if (canWrite && setDefaultValuesIfNeeded(list, values)) {
      dispatch(queryParamChanged())
      dispatch(saveMap(updateAndRunQueries))
    } else {
      updateAndRunQueries()
    }
  }
}

export function setQueryParamsValues (values) {
  return async function (dispatch, getState) {
    const { queryParams } = getState()

    const paramsStr = getQueryParamsString(queryParams.list, values)
    window.history.replaceState({}, '', `${window.location.pathname}?${paramsStr}`)

    const hash = md5(paramsStr)
    dispatch({ type: setQueryParamsValues.name, values, url: paramsStr, hash })
  }
}
