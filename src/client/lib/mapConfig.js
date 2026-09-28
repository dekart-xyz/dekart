import { receiveMapConfig, removeEffect, removeFilter, removeLayer, setFeatures, toggleSplitMap } from '@kepler.gl/actions'
import { KeplerGlSchema } from '@kepler.gl/schemas'
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
      const configToSaveObj = KeplerGlSchema.getConfigToSave(kepler)
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
  const newConfig = uniqueMapConfigLayers(JSON.parse(report.mapConfig))
  const currentConfig = KeplerGlSchema.getConfigToSave(kepler)
  if (shouldUpdateMapConfig(currentConfig, newConfig)) {
    const newConfigNormalized = KeplerGlSchema.parseSavedConfig(newConfig)
    dispatch(receiveMapConfig(newConfigNormalized))
    return true
  } else {
    return false
  }
}

// Restore the full authored map without merging saved layers into the existing layers.
export function restoreAuthoredMapConfig (report, dispatch, getState) {
  const savedConfig = uniqueMapConfigLayers(JSON.parse(report.mapConfig))
  const currentConfig = KeplerGlSchema.getConfigToSave(getState().keplerGl.kepler)
  if (!shouldUpdateMapConfig(currentConfig, savedConfig)) return

  const currentVisState = getState().keplerGl.kepler.visState
  // Kepler merges split maps into the current layout, so close viewer panels first.
  if (currentVisState.splitMaps.length) dispatch(toggleSplitMap(0))
  for (let index = currentVisState.filters.length - 1; index >= 0; index--) dispatch(removeFilter(index))
  for (const layer of currentVisState.layers) dispatch(removeLayer(layer.id))
  // Kepler appends effects and drawn features when keeping loaded datasets.
  for (const effect of currentVisState.effects) dispatch(removeEffect(effect.id))
  dispatch(setFeatures([]))
  dispatch(receiveMapConfig(KeplerGlSchema.parseSavedConfig(savedConfig), { keepExistingConfig: true }))
}
