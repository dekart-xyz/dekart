import { receiveMapConfig } from '@kepler.gl/actions'
import { KeplerGlSchema } from '@kepler.gl/schemas'
import { setLastMapConfigChanged } from '../actions/report'
import { useDispatch, useSelector } from 'react-redux'
import { useEffect } from 'react'
import { deepCompare } from './deepCompare'

// This function is used to compare the current map config with the new map config
export function shouldUpdateMapConfig (oldMapConfigIn, newMapConfigIn) {
  if (!oldMapConfigIn && newMapConfigIn) {
    // when server config is empty but kepler has a config, we should update
    return true
  }
  const newMapConfig = structuredClone(newMapConfigIn)
  newMapConfig.config.mapState.latitude = 0
  newMapConfig.config.mapState.longitude = 0
  newMapConfig.config.mapState.zoom = 0

  const oldMapConfig = structuredClone(oldMapConfigIn)
  oldMapConfig.config.mapState.latitude = 0
  oldMapConfig.config.mapState.longitude = 0
  oldMapConfig.config.mapState.zoom = 0

  return !deepCompare(oldMapConfig, newMapConfig)
}

// Keep dataset publication history beside the Kepler config so an empty layer list remains authoritative.
export function getMapConfigToSave (kepler, datasets, mapConfigInputStr) {
  const config = KeplerGlSchema.getConfigToSave(kepler)
  const activeDatasetIds = new Set(datasets.map(dataset => dataset.id))
  let savedDatasetIds = []
  if (mapConfigInputStr) {
    savedDatasetIds = JSON.parse(mapConfigInputStr).dekart?.datasetIds || []
  }
  const loadedDatasetIds = Object.keys(kepler?.visState?.datasets || {})
  config.dekart = {
    datasetIds: [...new Set([...savedDatasetIds, ...loadedDatasetIds])]
      .filter(datasetId => activeDatasetIds.has(datasetId))
  }
  return config
}

// null identifies legacy configs whose publication state still needs server-side inference.
export function mapConfigHasDataset (mapConfigInputStr, datasetId) {
  if (!mapConfigInputStr) {
    return null
  }
  const datasetIds = JSON.parse(mapConfigInputStr).dekart?.datasetIds
  return datasetIds ? datasetIds.includes(datasetId) : null
}

// Update the map config if it has changed locally
export function useCheckMapConfig () {
  const dispatch = useDispatch()
  const kepler = useSelector(state => state.keplerGl.kepler)
  const report = useSelector(state => state.report)
  const { mapConfig } = report || {}
  const datasets = useSelector(state => state.dataset.list)
  const updatingNum = useSelector(state => state.dataset.updatingNum)
  const downloadingNum = useSelector(state => state.dataset.downloading.length)

  useEffect(() => {
    if (updatingNum > 0 || downloadingNum > 0) {
      // skip checking map config while datasets are updating
      if (checkMapConfigTimer) {
        clearTimeout(checkMapConfigTimer)
      }
      return
    }
    return checkMapConfig(kepler, mapConfig, dispatch, datasets)
  }, [kepler, mapConfig, dispatch, report, datasets, updatingNum])
}

let checkMapConfigTimer
function checkMapConfig (kepler, mapConfigInputStr, dispatch, datasets) {
  if (checkMapConfigTimer) {
    clearTimeout(checkMapConfigTimer)
  }
  checkMapConfigTimer = setTimeout(() => {
    if (kepler && datasets) {
      const configToSaveObj = getMapConfigToSave(kepler, datasets, mapConfigInputStr)
      const currentConfig = mapConfigInputStr ? JSON.parse(mapConfigInputStr) : null
      if (shouldUpdateMapConfig(currentConfig, configToSaveObj)) {
        dispatch(setLastMapConfigChanged())
      }
    }
    checkMapConfigTimer = null
  }, 100) // 100ms delay to avoid calls when playing animation
  return () => {
    if (checkMapConfigTimer) {
      clearTimeout(checkMapConfigTimer)
    }
  }
}

export function receiveReportUpdateMapConfig (report, dispatch, getState) {
  const { kepler } = getState().keplerGl
  const newConfig = JSON.parse(report.mapConfig)
  const currentConfig = KeplerGlSchema.getConfigToSave(kepler)
  // Dekart metadata must not make a legacy config look like a remote visual change.
  const newKeplerConfig = structuredClone(newConfig)
  delete newKeplerConfig.dekart
  if (shouldUpdateMapConfig(currentConfig, newKeplerConfig)) {
    const newConfigNormalized = KeplerGlSchema.parseSavedConfig(newConfig)
    dispatch(receiveMapConfig(newConfigNormalized))
    return true
  } else {
    return false
  }
}
