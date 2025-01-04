import { CreateDatasetRequest, RemoveDatasetRequest, UpdateDatasetConnectionRequest, UpdateDatasetNameRequest } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { grpcCall } from './grpc'
import { downloading, setError, finishDownloading, success, info, warn } from './message'
import { addDataToMap, toggleSidePanel, reorderLayer, removeDataset as removeDatasetFromKepler } from '@dekart-xyz/kepler.gl/dist/actions'
import { processCsvData, processGeojson } from '@dekart-xyz/kepler.gl/dist/processors'
import { get } from '../lib/api'
import getDatasetName from '../lib/getDatasetName'
import { runQuery } from './query'
import { KeplerGlSchema } from '@dekart-xyz/kepler.gl/dist/schemas'

export function createDataset (reportId) {
  return (dispatch, getState) => {
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

export function removeDataset (datasetId) {
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
      dispatch(success('Dataset removed'))
    }))
  }
}

export function keplerDatasetStartUpdating () {
  return { type: keplerDatasetStartUpdating.name }
}

export function keplerDatasetFinishUpdating () {
  return { type: keplerDatasetFinishUpdating.name }
}

export function downloadDataset (dataset, sourceId, extension, prevDatasetsList) {
  return async (dispatch, getState) => {
    const { dataset: { list: datasets }, files, queries, keplerGl } = getState()
    const label = getDatasetName(dataset, queries, files)
    dispatch({ type: downloadDataset.name, dataset })
    dispatch(downloading(dataset))
    const { token } = getState()
    let data
    try {
      const res = await get(`/dataset-source/${dataset.id}/${sourceId}.${extension}`, token)
      if (extension === 'csv') {
        const csv = await res.text()
        data = processCsvData(csv)
      } else {
        const json = await res.json()
        data = processGeojson(json)
      }
    } catch (err) {
      dispatch(finishDownloading(dataset)) // remove downloading message
      if (err.message.includes('CSV is empty')) {
        dispatch(warn(<><i>{label}</i> Result is empty</>))
      } else if (err.status === 410 && dataset.queryId) { // gone from dw query temporary storage
        const { canRun, queryText } = getState().queryStatus[dataset.queryId]
        if (!canRun) {
          dispatch(warn(<><i>{label}</i> result expired</>, false))
          return
        }
        dispatch(info(<><i>{label}</i> result expired, re-running</>))
        dispatch(runQuery(dataset.queryId, queryText))
      } else {
        dispatch(setError(err))
      }
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
    dispatch(finishDownloading(dataset))
    const { reportStatus } = getState()
    if (reportStatus.edit) {
      dispatch(toggleSidePanel('layer'))
    }
  }
}

export function openDatasetSettingsModal (datasetId) {
  return { type: openDatasetSettingsModal.name, datasetId }
}

export function closeDatasetSettingsModal (datasetId) {
  return { type: closeDatasetSettingsModal.name, datasetId }
}
