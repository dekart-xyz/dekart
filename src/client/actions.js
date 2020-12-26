import { getReportStream, unary } from './lib/grpc'
import { get } from './lib/api'
import { processCsvData } from 'kepler.gl/dist/processors'
import { addDataToMap, receiveMapConfig, showDatasetTable, toggleModal, ActionTypes as KeplerActionTypes } from 'kepler.gl/actions'
import { CreateQueryRequest, Query, RunQueryRequest, UpdateQueryRequest, UpdateReportRequest, Report } from '../proto/dekart_pb'
import { Dekart } from '../proto/dekart_pb_service'
import KeplerGlSchema from 'kepler.gl/schemas'
import { streamError, genericError, success } from './lib/message'

let reportStreamCancelable

export function closeReport (reportId) {
  return (dispatch) => {
    if (reportStreamCancelable) {
      reportStreamCancelable.cancel()
    }
    dispatch({
      type: closeReport.name
    })
  }
}

export function saveMapConfig () {
  return async (dispatch, getState) => {
    dispatch({ type: saveMapConfig.name })
    const { keplerGl, report } = getState()
    const configToSave = KeplerGlSchema.getConfigToSave(keplerGl.kepler)
    const request = new UpdateReportRequest()
    const reportPayload = new Report()
    reportPayload.setId(report.id)
    reportPayload.setMapConfig(JSON.stringify(configToSave))
    request.setReport(reportPayload)
    try {
      await unary(Dekart.UpdateReport, request)
      success('Map Config Saved')
    } catch (err) {
      dispatch(error(err))
    }
  }
}

export function openReport (reportId) {
  return (dispatch) => {
    dispatch({
      type: openReport.name
    })
    reportStreamCancelable = getReportStream(
      reportId,
      (reportStreamResponse) => {
        dispatch(reportUpdate(reportStreamResponse))
      },
      (code) => {
        streamError(code)
      }
    )
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
  return async (dispatch, getState) => {
    const { queries: prevQueriesList, report: prevReport } = getState()
    dispatch({
      type: reportUpdate.name,
      report,
      queriesList
    })
    const prevMapConfig = prevReport ? prevReport.mapConfig : ''
    if (report.mapConfig && !prevMapConfig) {
      const parsedConfig = KeplerGlSchema.parseSavedConfig(JSON.parse(report.mapConfig))
      dispatch(receiveMapConfig(parsedConfig))
    }
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

// export function saveVisState () {
//   return (dispatch, getState) => {
//     const { reportStatus } = getState()
//     if (reportStatus.dataAdded) {
//       console.log('saveVisState')
//     }
//   }
// }

export function showDataTable (query) {
  console.log(KeplerActionTypes.SHOW_DATASET_TABLE)
  return (dispatch) => {
    dispatch(showDatasetTable(query.id))
    dispatch(toggleModal('dataTable'))
  }
}

export function error (err) {
  console.error(err)
  genericError(err)
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
      success('Query Saved')
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
