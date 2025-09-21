import { KeplerGlSchema } from '@kepler.gl/schemas'
import { removeDataset } from '@kepler.gl/actions'

import { grpcCall, grpcStream, grpcStreamCancel } from './grpc'
import { success } from './message'
import { ArchiveReportRequest, CreateReportRequest, SetDiscoverableRequest, ForkReportRequest, Query, Report, ReportListRequest, UpdateReportRequest, File, ReportStreamRequest, PublishReportRequest, AllowExportDatasetsRequest, Readme, AddReportDirectAccessRequest, ConnectionType, SetTrackViewersRequest } from 'dekart-proto/dekart_pb'
import { Dekart } from 'dekart-proto/dekart_pb_service'
import { createQuery, downloadQuerySource } from './query'
import { downloadDataset } from './dataset'
import { shouldAddQuery } from '../lib/shouldAddQuery'
import { shouldUpdateDataset } from '../lib/shouldUpdateDataset'
import { needSensitiveScopes } from './user'
import { getQueryParamsObjArr } from '../lib/queryParams'
import { receiveReportUpdateMapConfig } from '../lib/mapConfig'

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

export function toggleReportEdit (edit) {
  return function (dispatch, getState) {
    const report = getState().report
    let fullscreen = null
    if (edit) {
      fullscreen = false
    } else if (report) {
      fullscreen = !report.readme
    }
    dispatch({ type: toggleReportEdit.name, edit, fullscreen })
  }
}

export function reportWillOpen (reportId) {
  return { type: reportWillOpen.name, reportId }
}

export function openReport (reportId) {
  return (dispatch, getState) => {
    const user = getState().user
    dispatch({
      type: openReport.name
    })
    dispatch(getReportStream(
      reportId,
      (reportStreamResponse, err) => {
        if (err) {
          return err
        }
        if (reportStreamResponse.report.needSensitiveScope && !user.sensitiveScopesGranted) {
          dispatch(needSensitiveScopes())
        } else {
          dispatch(reportUpdate(reportStreamResponse))
        }
      }
    ))
  }
}

function shouldAddFile (file, prevFileList, filesList, mapConfigUpdated) {
  if (file.fileStatus < File.Status.STATUS_STORED) {
    return false
  }
  if (!file.sourceId) {
    return false
  } else if (mapConfigUpdated) {
    return true
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

export function setReportChanged (changed) {
  return { type: setReportChanged.name, changed }
}

export function reportUpdate (reportStreamResponse) {
  const { report, queriesList, datasetsList, filesList, queryJobsList, directAccessEmailsList } = reportStreamResponse
  return async (dispatch, getState) => {
    const {
      queries: prevQueriesList,
      dataset: { list: prevDatasetsList },
      files: prevFileList,
      env,
      connection,
      user,
      queryJobs: prevQueryJobsList,
      queryParams: { hash },
      reportStatus: { lastChanged, lastSaved, savedReportVersion }
    } = getState()

    dispatch({
      type: reportUpdate.name,
      report,
      queriesList,
      prevQueriesList,
      datasetsList,
      prevDatasetsList,
      filesList,
      queryJobsList,
      hash,
      directAccessEmailsList
    })
    let mapConfigUpdated = false
    if (
      report.mapConfig &&
      report.updatedAt > savedReportVersion && // ignore when updated version same as last saved to prevent maps reloads
      lastSaved >= lastChanged // ignore overwriting unsaved changes
    ) {
      mapConfigUpdated = receiveReportUpdateMapConfig(report, dispatch, getState)
    }

    if (!mapConfigUpdated) { // new map config reset data anyway
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
    }

    queriesList.forEach((query) => {
      if (shouldDownloadQueryText(query, prevQueriesList, queriesList)) {
        dispatch(downloadQuerySource(query))
      }
    })

    const { ALLOW_FILE_UPLOAD } = env.variables
    const { queryParams } = getState()
    datasetsList.forEach((dataset) => {
      let extension = 'csv'
      if (dataset.queryId) {
        const query = queriesList.find(q => q.id === dataset.queryId)
        const queryJob = queryJobsList.find(job => job.queryId === query.id && job.queryParamsHash === queryParams.hash)
        if (shouldAddQuery(queryJob, prevQueryJobsList, mapConfigUpdated) || shouldUpdateDataset(dataset, prevDatasetsList)) {
          if (dataset.connectionType === ConnectionType.CONNECTION_TYPE_WHEROBOTS) {
            extension = 'parquet'
          }
          dispatch(downloadDataset(
            dataset,
            queryJob.jobResultId,
            extension,
            prevDatasetsList
          ))
        }
      } else if (dataset.fileId) {
        const file = filesList.find(f => f.id === dataset.fileId)
        if (shouldAddFile(file, prevFileList, filesList, mapConfigUpdated) || shouldUpdateDataset(dataset, prevDatasetsList)) {
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
      } else if ((!ALLOW_FILE_UPLOAD && !connection.userDefined) || (user.isPlayground && !user.isDefaultWorkspace)) {
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

export function allowExportDatasets (reportId, allowExport) {
  return async (dispatch) => {
    dispatch({ type: allowExportDatasets.name })
    const req = new AllowExportDatasetsRequest()
    req.setReportId(reportId)
    req.setAllowExport(allowExport)
    dispatch(grpcCall(Dekart.AllowExportDatasets, req))
  }
}

export function publishReport (reportId, publish) {
  return async (dispatch) => {
    dispatch({ type: publishReport.name })
    const req = new PublishReportRequest()
    req.setReportId(reportId)
    req.setPublish(publish)
    dispatch(grpcCall(Dekart.PublishReport, req, (response) => {
      console.log('response', response)
      // Handle response when publishing is blocked
      if (response.publicMapsLimitReached) {
        dispatch(success('Freemium plan allows only 1 public map. Upgrade to publish more maps.'))
      }
    }))
  }
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
      dispatch(success('New Map Created'))
    }))
  }
}

export function reportTitleChange (title) {
  return {
    type: reportTitleChange.name,
    title
  }
}

export function savedReport (lastSaved, savedReportVersion) {
  return { type: savedReport.name, lastSaved, savedReportVersion }
}

export function toggleReportFullscreen () {
  return { type: toggleReportFullscreen.name }
}

export function addReportDirectAccess (reportId, emails) {
  return async (dispatch) => {
    dispatch({ type: addReportDirectAccess.name })
    const request = new AddReportDirectAccessRequest()
    request.setReportId(reportId)
    request.setEmailsList(emails)
    dispatch(grpcCall(Dekart.AddReportDirectAccess, request, () => {
      dispatch(success('Direct access updated'))
    }))
  }
}

export function setTrackViewers (reportId, trackViewers) {
  return async (dispatch) => {
    dispatch({ type: setTrackViewers.name })
    const req = new SetTrackViewersRequest()
    req.setReportId(reportId)
    req.setTrackViewers(trackViewers)
    dispatch(grpcCall(Dekart.SetTrackViewers, req))
  }
}

export function saveMap (onSaveComplete = () => {}) {
  return async (dispatch, getState) => {
    dispatch({ type: saveMap.name })
    const { keplerGl, report, reportStatus, queryStatus, queryParams, readme } = getState()
    const lastSaved = reportStatus.lastChanged
    const configToSave = KeplerGlSchema.getConfigToSave(keplerGl.kepler)
    const request = new UpdateReportRequest()
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
    if (readme.markdown !== null) {
      const readmeProp = new Readme()
      readmeProp.setMarkdown(readme.markdown)
      request.setReadme(readmeProp)
    }
    request.setReportId(report.id)
    request.setMapConfig(JSON.stringify(configToSave))
    request.setTitle(reportStatus.title)
    request.setQueryList(queries)
    request.setQueryParamsList(getQueryParamsObjArr(queryParams.list))
    dispatch(grpcCall(Dekart.UpdateReport, request, (res) => {
      onSaveComplete()
      dispatch(savedReport(lastSaved, res.updatedAt))
    }))
  }
}
