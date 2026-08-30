import { CreateDatasetRequest, RemoveDatasetRequest, UpdateDatasetNameRequest } from 'dekart-proto/dekart_pb'
import { Dekart } from 'dekart-proto/dekart_pb_service'
import { grpcCall } from './grpc'
import { setError, success, info, warn } from './message'
import { addDataToMap, toggleSidePanel, replaceDataInMap } from '@kepler.gl/actions'
import { get } from '../lib/api'
import getDatasetName from '../lib/getDatasetName'
import { runWarehouseQuery } from './query'
import { filenameWithExtension, mimeFromExtension } from '../lib/mime'
import { failDuckDBSource, registerDuckDBFileSource, registerDuckDBSource, removeDuckDBSource } from './duckdb'
import waitForKeplerDataset from '../lib/waitForKeplerDataset'
import { keplerDatasetFinishUpdating, keplerDatasetStartUpdating } from './kepler'

let duckDBDatabaseModule = null

function loadDuckDBDatabase () {
  if (!duckDBDatabaseModule) {
    duckDBDatabaseModule = import('../lib/duckdb/database').catch(error => {
      duckDBDatabaseModule = null
      throw error
    })
  }
  return duckDBDatabaseModule
}

async function dropDuckDBSourceTable (tableName) {
  if (!tableName) return
  const { dropDuckDBTable } = await loadDuckDBDatabase()
  await dropDuckDBTable(tableName)
}

// Custom error to mark empty result cases for downstream handling
class EmptyResultError extends Error {
  constructor (message = 'Empty result') {
    super(message)
    this.name = 'EmptyResultError'
  }
}

export function createDataset (reportId) {
  return (dispatch) => {
    dispatch({ type: createDataset.name })
    const request = new CreateDatasetRequest()
    request.setReportId(reportId)
    dispatch(grpcCall(Dekart.CreateDataset, request))
  }
}

export function setActiveDataset (datasetId) {
  return (dispatch, getState) => {
    const { list: datasets } = getState().dataset
    const dataset = datasets.find(d => d.id === datasetId) || datasets[0]
    if (dataset) {
      dispatch({ type: setActiveDataset.name, dataset })
    }
  }
}

export function updateDatasetName (datasetId, name) {
  return async (dispatch, getState) => {
    const { list: datasets } = getState().dataset
    const dataset = datasets.find(d => d.id === datasetId)
    if (!dataset) {
      return
    }
    dispatch({ type: updateDatasetName.name, datasetId, name })
    const request = new UpdateDatasetNameRequest()
    request.setDatasetId(datasetId)
    request.setName(name)
    dispatch(grpcCall(Dekart.UpdateDatasetName, request))
  }
}

export function removeDataset (datasetId, silent = false) {
  return async (dispatch, getState) => {
    const { list: datasets, active: activeDataset } = getState().dataset
    if (activeDataset.id === datasetId) {
      // removed active query
      const datasetsLeft = datasets.filter(q => q.id !== datasetId)
      if (datasetsLeft.length === 0) {
        dispatch(setError(new Error('Cannot remove last dataset')))
        return
      }
      dispatch(setActiveDataset(datasetsLeft[0].id))
    }
    await dispatch(removeDuckDBSource(datasetId))
    dispatch({ type: removeDataset.name, datasetId })

    const request = new RemoveDatasetRequest()
    request.setDatasetId(datasetId)
    dispatch(grpcCall(Dekart.RemoveDataset, request, (res) => {
      if (!silent) {
        dispatch(success('Dataset removed'))
      }
    }))
  }
}

export function downloadingProgress (loaded, controller) {
  return { type: downloadingProgress.name, loaded, controller }
}

function isEmptyDatasetError (err) {
  const message = err.message || ''
  return err instanceof EmptyResultError ||
    message.includes('CSV is empty') ||
    message.includes('Empty result') ||
    err.status === 204
}

export function processDownloadError (err, dataset, label, emptySourceRetained, controller) {
  return async function (dispatch, getState) {
    if (!getState().dataset.downloading.some(item => item.controller === controller)) {
      return
    }
    const resultExpired = err.status === 410 && dataset.queryId
    const emptyResult = isEmptyDatasetError(err)
    if (!resultExpired && !(emptyResult && emptySourceRetained)) {
      await dispatch(failDuckDBSource(
        dataset.id,
        err.message || 'Dataset download failed',
        { downloadController: controller }
      ))
    }
    if (!getState().dataset.downloading.some(item => item.controller === controller)) {
      return
    }
    dispatch({ type: processDownloadError.name, controller })
    if (emptyResult) {
      dispatch(warn(<><i>{label}</i> Result is empty</>))
    } else if (resultExpired) { // gone from dw query temporary storage
      const state = getState()
      const { canRun, queryText } = state.queryStatus[dataset.queryId]
      if (!canRun || state.queryExecutionsPending[dataset.queryId]) {
        // it's running already, do nothing
        return
      }
      // don't need to check if user can run query (report.CanWrite || report.Discoverable)
      // because report cannot be opened if it's not discoverable
      // so if user can open report, they can run query
      dispatch(info(<><i>{label}</i> result expired, re-running</>, 'query-result-expired'))
      dispatch(runWarehouseQuery(dataset.queryId, queryText))
    } else if (err.name === 'AbortError') {
      dispatch(setError(new Error('Download cancelled by user')))
    } else if (err.status === 0) {
      dispatch(setError(new Error('Network error when downloading dataset'), false))
    } else {
      dispatch(setError(err))
    }
  }
}

// result available but need to add to map still
export function finishDownloading (prevDatasetsList, res, extension, label, controller) {
  return { type: finishDownloading.name, prevDatasetsList, res, extension, label, controller }
}

// remove dataset from downloading list
export function finishAddingDatasetToMap (controller) {
  return { type: finishAddingDatasetToMap.name, controller }
}

// clearDatasetInMap publishes a zero-row Arrow table while preserving existing layers and fields.
async function clearDatasetInMap (dispatch, getState, dataset, label, reportId, controller) {
  const existing = getState().keplerGl.kepler?.visState.datasets?.[dataset.id]
  if (!existing || existing.dataContainer.numRows() === 0) {
    return
  }
  const emptyTable = existing.dataContainer.getTable().slice(0, 0)
  dispatch(keplerDatasetStartUpdating())
  dispatch(replaceDataInMap({
    datasetToReplaceId: dataset.id,
    datasetToUse: {
      info: { id: dataset.id, label, format: 'arrow' },
      data: { dekartArrowTable: emptyTable }
    },
    options: {
      keepExistingConfig: true,
      centerMap: false
    }
  }))
  dispatch(keplerDatasetFinishUpdating())
  await waitForKeplerDataset(
    getState,
    dataset.id,
    existing,
    0,
    () => getState().report?.id === reportId &&
      getState().dataset.downloading.some(item => item.controller === controller)
  )
}

export function addDatasetToMap (dataset, prevDatasetsList, res, extension, sourceId, controller) {
  return async function (dispatch, getState) {
    // A delayed confirmation callback must not restart a superseded download attempt.
    if (!getState().dataset.downloading.some(item => item.controller === controller)) {
      return
    }
    // must be before async so dataset is not added twice
    const { lastAddedQueryParamsHash } = getState().dataset
    const queryParamsHash = getState().queryParams.hash
    const { files, queryJobs, dataset: { list: datasets } } = getState()
    const queryJob = queryJobs.find(j => j.queryId === dataset.queryId && j.queryParamsHash === queryParamsHash)
    dispatch({ type: addDatasetToMap.name, dataset, sourceId, controller, queryParamsHash, queryJob })
    const reportId = getState().report?.id
    const label = getDatasetName(dataset, datasets, files)
    let data
    let sourceFile
    let sourceTable
    try {
      try {
        const blob = await res.blob()
        sourceFile = new File(
          [blob],
          filenameWithExtension(label, extension),
          { type: mimeFromExtension(extension) })

        if (!sourceFile.size) {
          throw new EmptyResultError('Empty result')
        }
        const { createDuckDBSourceTable } = await loadDuckDBDatabase()
        sourceTable = await createDuckDBSourceTable(sourceFile, extension, dataset.id, controller.signal)
        if (!sourceTable.totalRows) {
          throw new EmptyResultError('Empty result')
        }
        data = {
          dekartDuckDBTable: {
            schema: 'main',
            name: sourceTable.tableName
          }
        }
      } catch (err) {
        let downloadError = err
        const currentDownload = getState().dataset.downloading.find(item => item.controller === controller)
        const shouldClearEmptySource = isEmptyDatasetError(err) &&
        getState().report?.id === reportId && Boolean(currentDownload)
        let emptySourceRetained = false
        try {
          if (shouldClearEmptySource && sourceFile?.size > 0) {
          // handles a non-empty file that represents an empty dataset—for example, a CSV containing headers but zero rows.
          // Keep the already-created native table when available; otherwise register the source file.
            emptySourceRetained = sourceTable
              ? await dispatch(registerDuckDBSource(dataset, sourceTable.tableName, sourceId, reportId))
              : await dispatch(registerDuckDBFileSource(dataset, sourceFile, extension, sourceId, reportId))
            if (emptySourceRetained) {
            // The runtime owns an adopted native table from this point onward.
              sourceTable = null
            }
          }
          // Bodyless empty responses have no schema to retain, but must still clear old Kepler rows.
          if (shouldClearEmptySource) {
            await clearDatasetInMap(dispatch, getState, dataset, label, reportId, controller)
          }
        } catch (recoveryError) {
          downloadError = recoveryError
          emptySourceRetained = false
        } finally {
          dispatch(processDownloadError(downloadError, dataset, label, emptySourceRetained, controller))
        }
        return
      }
      const currentDownloadBeforeKepler = getState().dataset.downloading.some(item => item.controller === controller)
      if (getState().report?.id !== reportId || !currentDownloadBeforeKepler) {
      // A new report or newer revision superseded this table before publication.
        dispatch(finishAddingDatasetToMap(controller))
        return
      }

      // check if dataset was already added to kepler
      const addedDatasets = getState().keplerGl.kepler?.visState.datasets || {}
      const prevDataset = prevDatasetsList.find(d => d.id === dataset.id && d.id in addedDatasets)
      const previousKeplerDataset = addedDatasets[dataset.id]
      const i = getState().dataset.list.findIndex(d => d.id === dataset.id)
      if (i < 0) {
        dispatch(finishAddingDatasetToMap(controller))
        return
      }
      try {
        if (prevDataset) {
          dispatch(keplerDatasetStartUpdating())
          const prevDataId = prevDataset.id
          const { reportStatus } = getState()
          const updateOptions = { keepExistingConfig: true, autoCreateLayers: false }
          // In view mode, prevent auto-centering/zooming
          if (!reportStatus.edit && queryJob && queryJob.queryParamsHash === lastAddedQueryParamsHash[dataset.queryId]) {
            updateOptions.centerMap = false
          }
          dispatch(replaceDataInMap({
            datasetToReplaceId: prevDataId,
            datasetToUse: {
              info: {
                label,
                id: dataset.id
              },
              data
            },
            options: updateOptions
          }))
          dispatch(keplerDatasetFinishUpdating())
        } else {
          dispatch(keplerDatasetStartUpdating())
          dispatch(addDataToMap({
            datasets: {
              info: {
                label,
                id: dataset.id
              },
              data
            }
          }))
          dispatch(keplerDatasetFinishUpdating())
        }
        // Native-table publication is asynchronous and must finish before runtime adoption.
        const published = await waitForKeplerDataset(
          getState,
          dataset.id,
          previousKeplerDataset,
          sourceTable.totalRows,
          () => getState().report?.id === reportId &&
          getState().dataset.downloading.some(item => item.controller === controller)
        )
        if (!published) {
          dispatch(finishAddingDatasetToMap(controller))
          return
        }
      } catch (err) {
        dispatch(processDownloadError(err, dataset, label, false, controller))
        return
      }
      const currentDownload = getState().dataset.downloading.some(item => item.controller === controller)
      if (getState().report?.id !== reportId || !currentDownload) {
        dispatch(finishAddingDatasetToMap(controller))
        return
      }
      const { reportStatus } = getState()
      if (reportStatus.edit) {
        dispatch(toggleSidePanel('layer'))
      }
      try {
        const adopted = await dispatch(registerDuckDBSource(
          dataset,
          sourceTable.tableName,
          sourceId,
          reportId
        ))
        if (adopted) {
          sourceTable = null
        }
      } catch (err) {
        dispatch(processDownloadError(err, dataset, label, false, controller))
        return
      }
      dispatch(finishAddingDatasetToMap(controller))
    } finally {
      if (sourceTable) {
        await dropDuckDBSourceTable(sourceTable.tableName).catch(() => {})
      }
    }
  }
}

export function cancelDownloading () {
  return async function (dispatch, getState) {
    const downloads = [...getState().dataset.downloading]
    downloads.forEach(download => download.controller.abort())
    dispatch({ type: cancelDownloading.name })
    for (const download of downloads) {
      await dispatch(failDuckDBSource(
        download.dataset.id,
        'Download cancelled by user',
        { sourceVersion: download.sourceId }
      ))
    }
  }
}

export function downloadDataset (dataset, sourceId, extension, prevDatasetsList) {
  return async (dispatch, getState) => {
    const { files, dataset: { list: datasets } } = getState()
    const label = getDatasetName(dataset, datasets, files)
    const controller = new AbortController()
    const reportId = getState().report?.id
    const loginHint = getState().user?.loginHint
    const previousDownload = getState().dataset.downloading.find(item => item.dataset.id === dataset.id)
    previousDownload?.controller.abort()
    dispatch({ type: downloadDataset.name, dataset, sourceId, controller })
    const { token, user: { claimEmailCookie } } = getState()
    const snapshotMode = getState().reportStatus.snapshotMode
    try {
      const res = await get(
        `/dataset-source/${dataset.id}/${sourceId}.${extension}`,
        token,
        controller.signal,
        (loaded) => dispatch(downloadingProgress(loaded, controller)),
        claimEmailCookie,
        reportId,
        loginHint
      )
      if (snapshotMode) {
        // why: snapshot rendering is headless and should avoid UI-driven add-to-map loops.
        dispatch(addDatasetToMap(dataset, prevDatasetsList, res, extension, sourceId, controller))
        return
      }
      dispatch(finishDownloading(prevDatasetsList, res, extension, label, controller))
    } catch (err) {
      dispatch(processDownloadError(err, dataset, label, false, controller))
    }
  }
}

export function openDatasetSettingsModal (datasetId) {
  return { type: openDatasetSettingsModal.name, datasetId }
}

export function closeDatasetSettingsModal (datasetId) {
  return { type: closeDatasetSettingsModal.name, datasetId }
}
