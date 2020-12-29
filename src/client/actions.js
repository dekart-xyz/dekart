import { getReportStream, getStream, unary } from './lib/grpc'
import { get } from './lib/api'
import { processCsvData } from 'kepler.gl/dist/processors'
import { addDataToMap, receiveMapConfig, showDatasetTable, toggleModal, toggleSidePanel } from 'kepler.gl/actions'
import { CreateQueryRequest, Query, RunQueryRequest, UpdateQueryRequest, UpdateReportRequest, Report, CreateReportRequest, ReportListRequest, ArchiveReportRequest } from '../proto/dekart_pb'
import { Dekart } from '../proto/dekart_pb_service'
import KeplerGlSchema from 'kepler.gl/schemas'
import { streamError, genericError, success, downloading } from './lib/message'

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

export function saveMap () {
  return async (dispatch, getState) => {
    dispatch({ type: saveMap.name })
    const { keplerGl, report, reportStatus } = getState()
    const configToSave = KeplerGlSchema.getConfigToSave(keplerGl.kepler)
    const request = new UpdateReportRequest()
    const reportPayload = new Report()
    reportPayload.setId(report.id)
    reportPayload.setMapConfig(JSON.stringify(configToSave))
    reportPayload.setTitle(reportStatus.title)
    request.setReport(reportPayload)
    try {
      await unary(Dekart.UpdateReport, request)
      success('Map Saved')
    } catch (err) {
      dispatch(error(err))
    }
  }
}

export function reportTitleChange (title) {
  return {
    type: reportTitleChange.name,
    title
  }
}

export function openReport (reportId, edit, history) {
  return (dispatch) => {
    dispatch({
      type: openReport.name,
      edit
    })
    reportStreamCancelable = getReportStream(
      reportId,
      (reportStreamResponse) => {
        dispatch(reportUpdate(reportStreamResponse))
      },
      (code) => {
        // https://github.com/grpc/grpc/blob/master/doc/statuscodes.md
        switch (code) {
          case 5:
            history.replace('/404')
            return
          case 3:
            history.replace('/400')
            return
          default:
            streamError(code)
        }
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
    if (report.mapConfig && !prevReport) {
      const parsedConfig = KeplerGlSchema.parseSavedConfig(JSON.parse(report.mapConfig))
      dispatch(receiveMapConfig(parsedConfig))
    }
    queriesList.forEach(query => {
      if (shouldAddDataset(query, prevQueriesList)) {
        dispatch(downloadJobResults(query))
      }
    })
  }
}

export function downloadJobResults (query) {
  return async (dispatch, getState) => {
    dispatch({ type: downloadJobResults.name, query })
    const finish = downloading()
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
    finish()
    const { reportStatus } = getState()
    if (reportStatus.edit) {
      dispatch(toggleSidePanel('layer'))
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

export function showDataTable (query) {
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

export function createReport (history) {
  return async (dispatch) => {
    const request = new CreateReportRequest()
    try {
      const { report } = await unary(Dekart.CreateReport, request)
      history.replace(`/reports/${report.id}/edit`)
    } catch (err) {
      dispatch(error(err))
      throw err
    }
    success('New Report Created')
  }
}

let reportStreamListCancelable

export function subscribeReports () {
  return (dispatch) => {
    dispatch({ type: subscribeReports.name })
    const request = new ReportListRequest()
    reportStreamListCancelable = getStream(
      Dekart.GetReportListStream,
      request,
      ({ reportsList }) => dispatch(reportsListUpdate(reportsList)),
      (code) => streamError(code)
    )
  }
}

export function unsubscribeReports () {
  return dispatch => {
    dispatch({ type: unsubscribeReports.name })
    reportStreamListCancelable.cancel()
  }
}

export function reportsListUpdate (reportsList) {
  return { type: reportsListUpdate.name, reportsList }
}

export function archiveReport (reportId) {
  return async dispatch => {
    dispatch({ type: archiveReport.name, reportId })
    const req = new ArchiveReportRequest()
    req.setReportId(reportId)
    req.setArchive(true)
    try {
      await unary(Dekart.ArchiveReport, req)
    } catch (err) {
      dispatch(error(err))
    }
  }
}
