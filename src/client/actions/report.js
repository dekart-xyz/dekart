import { KeplerGlSchema } from '@dekart-xyz/kepler.gl/dist/schemas'
import { receiveMapConfig, removeDataset } from '@dekart-xyz/kepler.gl/dist/actions'

import { getReportStream, getStream, unary } from '../lib/grpc'
import { error, streamError, success } from './message'
import { ArchiveReportRequest, CreateReportRequest, SetDiscoverableRequest, ForkReportRequest, Query, Report, ReportListRequest, UpdateReportRequest, File } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { createQuery, downloadQuerySource } from './query'
import { downloadDataset } from './dataset'

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

export function openReport (reportId, edit) {
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
      (code, message) => dispatch(streamError(code, message))
    )
  }
}

function shouldAddQuery (query, prevQueriesList, queriesList) {
  if (!query.jobResultId) {
    return false
  }
  if (!prevQueriesList) {
    return true
  }
  if (prevQueriesList.length !== queriesList.length) { // TODO: why is this needed?
    return true
  }
  const prevQueryState = prevQueriesList.find(q => q.id === query.id)
  if (!prevQueryState || prevQueryState.jobResultId !== query.jobResultId) {
    return true
  }
  return false
}

function shouldAddFile (file, prevFileList, filesList) {
  if (file.fileStatus < File.Status.STATUS_STORED) {
    return false
  }
  if (!file.sourceId) {
    return false
  }

  if (!prevFileList) {
    return true
  }

  const prevFileState = prevFileList.find(f => f.id === file.id)
  if (!prevFileState || prevFileState.fileStatus !== file.fileStatus || prevFileState.sourceId !== file.sourceId) {
    return true
  }
}

function shouldDownloadQueryText (query, prevQueriesList, queriesList) {
  if (query.querySource !== Query.QuerySource.QUERY_SOURCE_STORAGE) {
    return false
  }
  if (!query.querySourceId) {
    return false
  }
  if (!prevQueriesList) {
    return true
  }
  const prevQueryState = prevQueriesList.find(q => q.id === query.id)
  if (!prevQueryState || prevQueryState.querySourceId !== query.querySourceId) {
    return true
  }
  return false
}

export function reportUpdate (reportStreamResponse) {
  const { report, queriesList, datasetsList, filesList } = reportStreamResponse
  return async (dispatch, getState) => {
    const { queries: prevQueriesList, datasets: prevDatasetsList, report: prevReport, files: prevFileList, env } = getState()
    dispatch({
      type: reportUpdate.name,
      report,
      queriesList,
      prevQueriesList,
      datasetsList,
      prevDatasetsList,
      filesList
    })
    if (report.mapConfig && !prevReport) {
      const parsedConfig = KeplerGlSchema.parseSavedConfig(JSON.parse(report.mapConfig))
      dispatch(receiveMapConfig(parsedConfig))
    }

    prevQueriesList.forEach(query => {
      if (!queriesList.find(q => q.id === query.id)) {
        const dataset = prevDatasetsList.find(d => d.queryId === query.id)
        if (dataset) {
          dispatch(removeDataset(dataset.id))
        }
      }
    })
    prevFileList.forEach(file => {
      if (!filesList.find(f => f.id === file.id)) {
        const dataset = prevDatasetsList.find(d => d.fileId === file.id)
        if (dataset) {
          dispatch(removeDataset(dataset.id))
        }
      }
    })

    queriesList.forEach((query) => {
      if (shouldDownloadQueryText(query, prevQueriesList, queriesList)) {
        dispatch(downloadQuerySource(query))
      }
    })

    let i = 0
    const { ALLOW_FILE_UPLOAD } = env.variables
    datasetsList.forEach((dataset) => {
      let extension = 'csv'
      if (dataset.queryId) {
        i++
        const query = queriesList.find(q => q.id === dataset.queryId)
        if (shouldAddQuery(query, prevQueriesList, queriesList)) {
          dispatch(downloadDataset(dataset, query.jobResultId, extension, `Query ${i}`))
        }
      } else if (dataset.fileId) {
        const file = filesList.find(f => f.id === dataset.fileId)
        if (shouldAddFile(file, prevFileList, filesList)) {
          if (file.mimeType === 'application/geo+json') {
            extension = 'geojson'
          }
          dispatch(downloadDataset(dataset, file.sourceId, extension, file.name))
        }
      } else if (!ALLOW_FILE_UPLOAD) {
        // create query right away
        dispatch(createQuery(dataset.id))
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
      (code, message) => dispatch(streamError(code, message))
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

export function setDiscoverable (reportId, discoverable) {
  return async (dispatch) => {
    dispatch({ type: setDiscoverable.name })
    const req = new SetDiscoverableRequest()
    req.setReportId(reportId)
    req.setDiscoverable(discoverable)
    try {
      await unary(Dekart.SetDiscoverable, req)
    } catch (err) {
      dispatch(error(err))
    }
  }
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

export function newReport (id) {
  return { type: newReport.name, id }
}

export function newForkedReport (id) {
  return { type: newForkedReport.name, id }
}

export function forkReport (reportId) {
  return async (dispatch, getState) => {
    dispatch({ type: forkReport.name })
    const request = new ForkReportRequest()
    request.setReportId(reportId)
    try {
      const { reportId } = await unary(Dekart.ForkReport, request)
      dispatch(newForkedReport(reportId))
      dispatch(success('Report Forked'))
    } catch (err) {
      dispatch(error(err))
    }
  }
}

export function createReport () {
  return async (dispatch) => {
    const request = new CreateReportRequest()
    try {
      const { report } = await unary(Dekart.CreateReport, request)
      dispatch(newReport(report.id))
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
    const { keplerGl, report, reportStatus, queryStatus } = getState()
    const configToSave = KeplerGlSchema.getConfigToSave(keplerGl.kepler)
    const request = new UpdateReportRequest()
    const reportPayload = new Report()
    const queries = Object.keys(queryStatus).reduce((queries, id) => {
      const status = queryStatus[id]
      if (status.changed) {
        const query = new Query()
        query.setId(id)
        query.setQueryText(status.queryText)
        query.setQuerySourceId(status.querySourceId)
        queries.push(query)
      }
      return queries
    }, [])
    reportPayload.setId(report.id)
    reportPayload.setMapConfig(JSON.stringify(configToSave))
    reportPayload.setTitle(reportStatus.title)
    request.setReport(reportPayload)
    request.setQueryList(queries)
    try {
      await unary(Dekart.UpdateReport, request)
      dispatch(success('Map Saved'))
    } catch (err) {
      dispatch(error(err))
    }
  }
}
