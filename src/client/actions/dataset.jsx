import { CreateDatasetRequest, RemoveDatasetRequest, UpdateDatasetConnectionRequest, UpdateDatasetNameRequest } from 'dekart-proto/dekart_pb'
import { Dekart } from 'dekart-proto/dekart_pb_service'
import { grpcCall } from './grpc'
import { setError, success, info, warn } from './message'
import { addDataToMap, toggleSidePanel, reorderLayer, removeDataset as removeDatasetFromKepler, loadFiles } from '@kepler.gl/actions'
import { processCsvData, processGeojson } from '@kepler.gl/processors'
import { get } from '../lib/api'
import getDatasetName from '../lib/getDatasetName'
import { runQuery } from './query'
import { KeplerGlSchema } from '@kepler.gl/schemas'
import wasmInit from 'parquet-wasm'

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

export function updateDatasetConnection (datasetId, connectionId) {
  return async (dispatch, getState) => {
    const { list: datasets } = getState().dataset
    const dataset = datasets.find(d => d.id === datasetId)
    if (!dataset) {
      return
    }
    dispatch({ type: updateDatasetConnection.name, datasetId })
    const request = new UpdateDatasetConnectionRequest()
    request.setDatasetId(datasetId)
    request.setConnectionId(connectionId)
    dispatch(grpcCall(Dekart.UpdateDatasetConnection, request))
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
      dispatch(setActiveDataset(datasetsLeft.id))
    }
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

// prevent saving report when dataset is being updated
export function keplerDatasetStartUpdating () {
  return { type: keplerDatasetStartUpdating.name }
}

export function keplerDatasetFinishUpdating () {
  return { type: keplerDatasetFinishUpdating.name }
}

export function downloadingProgress (dataset, loaded) {
  return { type: downloadingProgress.name, dataset, loaded }
}

export function processDownloadError (err, dataset, label) {
  return function (dispatch, getState) {
    dispatch({ type: processDownloadError.name, dataset })
    if (err.message.includes('CSV is empty')) {
      dispatch(warn(<><i>{label}</i> Result is empty</>))
    } else if (err.status === 410 && dataset.queryId) { // gone from dw query temporary storage
      const { canRun, queryText } = getState().queryStatus[dataset.queryId]
      if (!canRun) {
        // it's running already, do nothing
        return
      }
      // don't need to check if user can run query (report.CanWrite || report.Discoverable)
      // because report cannot be opened if it's not discoverable
      // so if user can open report, they can run query
      dispatch(info(<><i>{label}</i> result expired, re-running</>))
      dispatch(runQuery(dataset.queryId, queryText))
    } else if (err.name === 'AbortError') {
      dispatch(setError(new Error('Download cancelled by user')))
    } else {
      dispatch(setError(err))
    }
  }
}

// result available but need to add to map still
export function finishDownloading (dataset, prevDatasetsList, res, extension, label) {
  return { type: finishDownloading.name, dataset, prevDatasetsList, res, extension, label }
}

// remove dataset from downloading list
export function finishAddingDatasetToMap (dataset) {
  return { type: finishAddingDatasetToMap.name, dataset }
}

let isWasmInitialized = false

export function addDatasetToMap (dataset, prevDatasetsList, res, extension) {
  return async function (dispatch, getState) {
    // must be before async so dataset is not added twice
    dispatch({ type: addDatasetToMap.name, dataset })

    if (!isWasmInitialized) {
      isWasmInitialized = true
      await wasmInit()
    }

    const { dataset: { list: datasets }, files, queries, keplerGl } = getState()
    const label = getDatasetName(dataset, queries, files)
    let data
    try {
      if (extension === 'csv') {
        const csv = await res.text()
        data = processCsvData(csv)
      } else if (extension === 'geojson') {
        const json = await res.json()
        data = processGeojson(json)
      } else if (extension === 'parquet') {
        const blob = await res.blob()
        data = await new Promise((resolve, reject) => {
          dispatch(loadFiles([new File([blob], label)], (r) => {
            const datasetData = r[0].data
            resolve(datasetData)
            return { type: 'none' } // dispatch a dummy action to satisfy loadFiles API
          }))
        })
      } else {
        throw new Error(`Unsupported dataset extension: ${extension}`)
      }
    } catch (err) {
      dispatch(processDownloadError(err, dataset, label))
      return
    }

    // check if dataset was already added to kepler
    const addedDatasets = getState().keplerGl.kepler?.visState.datasets || {}
    const prevDataset = prevDatasetsList.find(d => d.id in addedDatasets)
    const i = datasets.findIndex(d => d.id === dataset.id)
    if (i < 0) {
      return
    }
    try {
      if (prevDataset) {
        dispatch(keplerDatasetStartUpdating())
        const prevLabel = getDatasetName(prevDataset, queries, files)

        // remember layer order, because kepler will reshuffle layers after adding dataset
        const layerOrder = [].concat(getState().keplerGl.kepler.visState.layerOrder)
        const layersAr = getState().keplerGl.kepler.visState.layers.map(layer => layer.id)
        const layerIdOrder = layerOrder.map(id => layersAr[id])
        const config = KeplerGlSchema.getConfigToSave(keplerGl.kepler)

        // filter for specific dataset
        config.config.visState.layers = config.config.visState.layers.filter(
          layer => layer.config.dataId === dataset.id
        )
        config.config.visState.filters = config.config.visState.filters.filter(
          f => f.dataId.includes(dataset.id)
        )

        // update layer labels
        if (prevDataset?.name !== dataset.name) {
          config.config.visState.layers = config.config.visState.layers.map(layer => {
            if (layer.config.label === prevLabel) {
              layer.config.label = label
            }
            return layer
          })
        }

        dispatch(removeDatasetFromKepler(dataset.id))

        // add dataset with previous config
        dispatch(addDataToMap({
          datasets: {
            info: {
              label,
              id: dataset.id
            },
            data
          },
          options: { keepExistingConfig: true },
          config // https://github.com/keplergl/kepler.gl/issues/176#issuecomment-410326304
        }))

        // restore layer order
        const newLayersAr = getState().keplerGl.kepler.visState.layers.map(layer => layer.id)
        if (newLayersAr.length === layerIdOrder.length) {
          const newOrder = layerIdOrder.map(id => newLayersAr.indexOf(id)).filter(i => i >= 0)
          if (newOrder.length === layerIdOrder.length) {
            dispatch(reorderLayer(newOrder))
          }
        }
        dispatch(keplerDatasetFinishUpdating())
      } else {
        dispatch(addDataToMap({
          datasets: {
            info: {
              label,
              id: dataset.id
            },
            data
          }
        }))
      }
    } catch (err) {
      dispatch(setError(
        new Error(`Failed to add data to map: ${err.message}`),
        false
      ))
      return
    }
    const { reportStatus } = getState()
    if (reportStatus.edit) {
      dispatch(toggleSidePanel('layer'))
    }
    dispatch({ type: finishAddingDatasetToMap.name, dataset })
  }
}

export function cancelDownloading () {
  return function (dispatch, getState) {
    getState().dataset.downloading.forEach(d => d.controller.abort())
    dispatch({ type: cancelDownloading.name })
  }
}

export function downloadDataset (dataset, sourceId, extension, prevDatasetsList) {
  return async (dispatch, getState) => {
    const { files, queries } = getState()
    const label = getDatasetName(dataset, queries, files)
    const controller = new AbortController()
    dispatch({ type: downloadDataset.name, dataset, controller })
    const { token, user: { claimEmailCookie } } = getState()
    try {
      const res = await get(
        `/dataset-source/${dataset.id}/${sourceId}.${extension}`,
        token,
        controller.signal,
        (loaded) => dispatch(downloadingProgress(dataset, loaded)),
        claimEmailCookie
      )
      dispatch(finishDownloading(dataset, prevDatasetsList, res, extension, label))
    } catch (err) {
      dispatch(processDownloadError(err, dataset, label))
    }
  }
}

export function openDatasetSettingsModal (datasetId) {
  return { type: openDatasetSettingsModal.name, datasetId }
}

export function closeDatasetSettingsModal (datasetId) {
  return { type: closeDatasetSettingsModal.name, datasetId }
}
