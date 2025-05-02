import { receiveMapConfig } from '@kepler.gl/actions'
import { KeplerGlSchema } from '@kepler.gl/schemas'
import { setReportChanged } from '../actions/report'
import { useDispatch, useSelector } from 'react-redux'
import { useEffect } from 'react'
import { deepCompare } from './deepCompare'

// This function is used to compare the current map config with the new map config
export function shouldUpdateMapConfig (oldMapConfigIn, newMapConfigIn) {
  if (newMapConfigIn.config.visState.layers.length > 0) {
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
  return false
}

// Update the map config if it has changed locally
export function useCheckMapConfig () {
  const dispatch = useDispatch()
  const kepler = useSelector(state => state.keplerGl.kepler)
  const report = useSelector(state => state.report)
  const { mapConfig } = report || {}
  const datasets = useSelector(state => state.dataset.list)
  const updatingNum = useSelector(state => state.dataset.updatingNum)

  useEffect(() => {
    if (updatingNum > 0) {
      // skip checking map config while datasets are updating
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
    if (kepler && mapConfigInputStr && datasets) {
      const configToSaveObj = KeplerGlSchema.getConfigToSave(kepler)
      const currentConfig = JSON.parse(mapConfigInputStr)
      if (shouldUpdateMapConfig(currentConfig, configToSaveObj)) {
        dispatch(setReportChanged())
      }
    }
    checkMapConfigTimer = null
  }, 0)
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
  if (shouldUpdateMapConfig(currentConfig, newConfig)) {
    const newConfigNormalized = KeplerGlSchema.parseSavedConfig(newConfig)
    dispatch(receiveMapConfig(newConfigNormalized))
    return true
  } else {
    return false
  }
}
