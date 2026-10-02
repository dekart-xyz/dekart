import { createNewDatasetSuccess, receiveMapConfig } from '@kepler.gl/actions'
import { KeplerGlSchema } from '@kepler.gl/schemas'
import { insertLayerAtRightOrder } from '@kepler.gl/reducers'
import { setLastMapConfigChanged } from '../actions/report'
import { useDispatch, useSelector } from 'react-redux'
import { useEffect } from 'react'
import { deepCompare } from './deepCompare'

// A saved layer can appear twice after an older view-to-edit transition merged it into loaded data.
function uniqueMapConfigLayers (mapConfig) {
  const visState = mapConfig.config.visState
  const seen = new Set()
  visState.layers = visState.layers.filter(layer => {
    if (seen.has(layer.id)) return false
    seen.add(layer.id)
    return true
  })
  if (visState.layerOrder) {
    visState.layerOrder = [...new Set(visState.layerOrder)]
  }
  return mapConfig
}

// This function is used to compare the current map config with the new map config
export function shouldUpdateMapConfig (oldMapConfigIn, newMapConfigIn) {
  if (!oldMapConfigIn && newMapConfigIn) {
    // when server config is empty but kepler has a config, we should update
    return true
  }
  const newMapConfig = uniqueMapConfigLayers(structuredClone(newMapConfigIn))
  newMapConfig.config.mapState.latitude = 0
  newMapConfig.config.mapState.longitude = 0
  newMapConfig.config.mapState.zoom = 0

  const oldMapConfig = uniqueMapConfigLayers(structuredClone(oldMapConfigIn))
  oldMapConfig.config.mapState.latitude = 0
  oldMapConfig.config.mapState.longitude = 0
  oldMapConfig.config.mapState.zoom = 0

  return !deepCompare(oldMapConfig, newMapConfig)
}

// Kepler exports only bound layers. Preserve authored layers and tooltips still waiting for data.
export function getMapConfigToSave (kepler, savedMapConfig) {
  const config = KeplerGlSchema.getConfigToSave(kepler)
  const pendingLayers = kepler.visState.layerToBeMerged
  // Once every layer is bound, Kepler's export already contains the complete configuration.
  if (!savedMapConfig || !pendingLayers.length) return config

  const savedVisState = uniqueMapConfigLayers(JSON.parse(savedMapConfig)).config.visState
  const pendingLayerIds = new Set(pendingLayers.map(layer => layer.id))
  const pendingDatasetIds = new Set(pendingLayers.map(layer => layer.config.dataId))
  // Use Kepler's surviving layer anchors so deletions cannot shift pending layers' stacking order.
  const { newLayers, newLayerOrder } = insertLayerAtRightOrder(
    config.config.visState.layers,
    savedVisState.layers.filter(layer => pendingLayerIds.has(layer.id)),
    config.config.visState.layers.map(layer => layer.id),
    savedVisState.layers.map(layer => layer.id)
  )
  config.config.visState.layers = newLayerOrder.map(id => newLayers.find(layer => layer.id === id))
  const pendingTooltipFields = Object.fromEntries(
    Object.entries(savedVisState.interactionConfig?.tooltip?.fieldsToShow || {})
      .filter(([dataId]) => pendingDatasetIds.has(dataId))
  )
  config.config.visState.interactionConfig.tooltip.fieldsToShow = {
    ...config.config.visState.interactionConfig.tooltip.fieldsToShow,
    ...pendingTooltipFields
  }
  return config
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
      const configToSaveObj = getMapConfigToSave(kepler, mapConfigInputStr)
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

// TODO: incsistent interafce we either pass getState or selector results
export function receiveReportUpdateMapConfig (report, dispatch, getState, previousMapConfig) {
  const { kepler } = getState().keplerGl
  const newConfig = uniqueMapConfigLayers(JSON.parse(report.mapConfig))
  // The report reducer already adopted the incoming version; pending layers still belong to the prior one.
  const currentConfig = getMapConfigToSave(kepler, previousMapConfig)
  if (shouldUpdateMapConfig(currentConfig, newConfig)) {
    const newConfigNormalized = KeplerGlSchema.parseSavedConfig(newConfig)
    dispatch(receiveMapConfig(newConfigNormalized))
    return true
  } else {
    return false
  }
}

// Restore authored configuration and rebuild layer data using the already loaded tables.
export function restoreAuthoredMapConfig (report, dispatch, getState) {
  const savedConfig = uniqueMapConfigLayers(JSON.parse(report.mapConfig))
  const currentConfig = getMapConfigToSave(getState().keplerGl.kepler, report.mapConfig)
  if (!shouldUpdateMapConfig(currentConfig, savedConfig)) return

  const datasets = Object.values(getState().keplerGl.kepler.visState.datasets)
  // Reset pending configuration too; retaining it merges saved layers again on the next query.
  dispatch(receiveMapConfig(KeplerGlSchema.parseSavedConfig(savedConfig)))
  // Reuse Kepler's completed tables without copying rows or downloading the viewer result again.
  dispatch(createNewDatasetSuccess({
    results: datasets.map(value => ({ status: 'fulfilled', value })),
    addToMapOptions: { centerMap: false, autoCreateLayers: false, autoCreateTooltips: false }
  }))
}
