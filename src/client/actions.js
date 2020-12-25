import { getReportStream, unary } from './lib/grpc'
import { get } from './lib/api'
import { processCsvData } from 'kepler.gl/dist/processors'
import { addDataToMap } from 'kepler.gl/actions'
import { Query, RunQueryRequest, UpdateQueryRequest } from '../proto/dekart_pb'
import { Dekart } from '../proto/dekart_pb_service'

let reportStreamCancelable

export function closeReport (reportId) {
  return (dispatch) => {
    if (reportStreamCancelable) {
      reportStreamCancelable.cancel()
    }
    dispatch({
      type: openReport.name
    })
  }
}

export function openReport (reportId) {
  return (dispatch) => {
    dispatch({
      type: openReport.name
    })
    reportStreamCancelable = getReportStream(reportId, (reportStreamResponse) => {
      dispatch(reportUpdate(reportStreamResponse))
    })
  }
}

function shouldAddDataset (query, queriesList) {
  if (!query.jobResultId) {
    return false
  }
  if (!queriesList) {
    return true
  }
  const prevQueryState = queriesList.find(q => q.id === query.id)
  if (!prevQueryState || prevQueryState.jobResultId !== query.jobResultId) {
    return true
  }
  return false
}

export function reportUpdate (reportStreamResponse) {
  const { report, queriesList } = reportStreamResponse
  console.log('queriesList', queriesList)
  return async (dispatch, getState) => {
    dispatch({
      type: reportUpdate.name,
      report,
      queriesList
    })
    const { prevQueriesList } = getState()
    await Promise.all(queriesList.map(async (query, i) => {
      if (shouldAddDataset(query, prevQueriesList)) {
        dispatch(downloadJobResults(query))
      }
    }))
  }
}

export function downloadJobResults (query) {
  return async (dispatch) => {
    dispatch({ type: downloadJobResults.name, query })
    let csv
    try {
      const res = await get(`/job-results/${query.jobResultId}.csv`)
      csv = await res.text()
    } catch (err) {
      dispatch(error(err))
    }
    const data = processCsvData(csv)
    dispatch(addDataToMap({
      datasets: {
        info: {
          label: 'Dataset',
          id: query.id
        },
        data
      }
    }))
  }
}

export function error (err) {
  console.error(err)
  return {
    type: error.name,
    err
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
    }
  }
}
export function runQuery (queryId) {
  return (dispatch) => {
    dispatch({ type: runQuery.name, queryId })
    const request = new RunQueryRequest()
    request.setQueryId(queryId)
    unary(Dekart.RunQuery, request).catch(err => dispatch(error(err)))
  }
}
