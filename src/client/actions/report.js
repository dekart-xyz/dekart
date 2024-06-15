import { KeplerGlSchema } from '@dekart-xyz/kepler.gl/dist/schemas'
import { receiveMapConfig, removeDataset } from '@dekart-xyz/kepler.gl/dist/actions'

import { grpcCall, grpcStream, grpcStreamCancel } from './grpc'
import { success } from './message'
import { ArchiveReportRequest, CreateReportRequest, SetDiscoverableRequest, ForkReportRequest, Query, Report, ReportListRequest, UpdateReportRequest, File, ReportStreamRequest } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { createQuery, downloadQuerySource } from './query'
import { downloadDataset } from './dataset'
import { shouldAddQuery } from '../lib/shouldAddQuery'
import { shouldUpdateDataset } from '../lib/shouldUpdateDataset'

export function closeReport () {
  return (dispatch) => {
    dispatch(grpcStreamCancel(Dekart.GetReportStream))
    dispatch({
      type: closeReport.name
    })
  }
}

function getReportStream (reportId, onMessage, onError) {
  const report = new Report()
  report.setId(reportId)
  const request = new ReportStreamRequest()
  request.setReport(report)
  return grpcStream(Dekart.GetReportStream, request, onMessage)
}

export function openReport (reportId, edit) {
  return (dispatch) => {
    dispatch({
      type: openReport.name,
      edit
    })
    dispatch(getReportStream(
      reportId,
      (reportStreamResponse, err) => {
        if (err) {
          return err
        }
        dispatch(reportUpdate(reportStreamResponse))
      }
    ))
  }
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
    const { queries: prevQueriesList, dataset: { list: prevDatasetsList }, report: prevReport, files: prevFileList, env, connection, user } = getState()
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

    const { ALLOW_FILE_UPLOAD } = env.variables
    datasetsList.forEach((dataset) => {
      let extension = 'csv'
      if (dataset.queryId) {
        const query = queriesList.find(q => q.id === dataset.queryId)
        if (shouldAddQuery(query, prevQueriesList) || shouldUpdateDataset(dataset, prevDatasetsList)) {
          dispatch(downloadDataset(
            dataset,
            query.jobResultId,
            extension,
            prevDatasetsList
          ))
        }
      } else if (dataset.fileId) {
        const file = filesList.find(f => f.id === dataset.fileId)
        if (shouldAddFile(file, prevFileList, filesList) || shouldUpdateDataset(dataset, prevDatasetsList)) {
          if (file.mimeType === 'application/geo+json') {
            extension = 'geojson'
          }
          dispatch(downloadDataset(
            dataset,
            file.sourceId,
            extension,
            prevDatasetsList
          ))
        }
      } else if ((!ALLOW_FILE_UPLOAD && !connection.userDefined) || user.isPlayground) {
        // create query right away
        dispatch(createQuery(dataset.id))
      }
    })
  }
}

export function subscribeReports () {
  return (dispatch) => {
    dispatch({ type: subscribeReports.name })
    const request = new ReportListRequest()
    dispatch(grpcStream(Dekart.GetReportListStream, request, (message, err) => {
      if (message) {
        dispatch(reportsListUpdate(message.reportsList))
      }
      return err
    }))
  }
}

export function unsubscribeReports () {
  return (dispatch, getState) => {
    dispatch(grpcStreamCancel(Dekart.GetReportListStream))
    dispatch({ type: unsubscribeReports.name })
  }
}

export function reportsListUpdate (reportsList) {
  return { type: reportsListUpdate.name, reportsList }
}

export function setDiscoverable (reportId, discoverable, allowEdit) {
  return async (dispatch) => {
    dispatch({ type: setDiscoverable.name })
    const req = new SetDiscoverableRequest()
    req.setReportId(reportId)
    req.setDiscoverable(discoverable)
    req.setAllowEdit(allowEdit)
    dispatch(grpcCall(Dekart.SetDiscoverable, req))
  }
}

export function archiveReport (reportId, archive) {
  return async dispatch => {
    dispatch({ type: archiveReport.name, reportId })
    const req = new ArchiveReportRequest()
    req.setReportId(reportId)
    req.setArchive(archive)
    dispatch(grpcCall(Dekart.ArchiveReport, req))
  }
}

export function newReport (id) {
  return { type: newReport.name, id }
}

export function newForkedReport (id) {
  return { type: newForkedReport.name, id }
}

export function forkReport (reportId) {
  return async (dispatch) => {
    dispatch({ type: forkReport.name })
    const request = new ForkReportRequest()
    request.setReportId(reportId)
    dispatch(grpcCall(Dekart.ForkReport, request, (res) => {
      const { reportId } = res
      dispatch(newForkedReport(reportId))
      dispatch(success('Report Forked'))
    }))
  }
}

export function createReport () {
  return async (dispatch) => {
    const request = new CreateReportRequest()
    dispatch(grpcCall(Dekart.CreateReport, request, (res) => {
      const { report } = res
      dispatch(newReport(report.id))
      dispatch(success('New Report Created'))
    }))
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
    dispatch(grpcCall(Dekart.UpdateReport, request, () => {
      dispatch(success('Map Saved'))
    }))
  }
}
