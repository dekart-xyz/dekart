import { KeplerGlSchema } from 'kepler.gl/schemas'
import { receiveMapConfig } from 'kepler.gl/actions'
import { getReportStream, getStream, unary } from '../lib/grpc'
import { error, streamError, success } from './message'
import { downloadJobResults } from './job'
import { ArchiveReportRequest, CreateReportRequest, Report, ReportListRequest, UpdateReportRequest } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'

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
            dispatch(streamError(code))
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
      // console.log('report.mapConfig', report.mapConfig)
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
  // console.log('reportsListUpdate', reportsList)
  return { type: reportsListUpdate.name, reportsList }
}

export function archiveReport (reportId, archive) {
  return async dispatch => {
    dispatch({ type: archiveReport.name, reportId })
    const req = new ArchiveReportRequest()
    req.setReportId(reportId)
    req.setArchive(archive)
    try {
      await unary(Dekart.ArchiveReport, req)
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
    dispatch(success('New Report Created'))
  }
}

export function reportTitleChange (title) {
  return {
    type: reportTitleChange.name,
    title
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
      dispatch(success('Map Saved'))
    } catch (err) {
      dispatch(error(err))
    }
  }
}
