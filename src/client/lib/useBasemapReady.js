import { useEffect } from 'react'

const cameraCoordinateTolerance = 0.00001
const cameraZoomTolerance = 0.001

function isExpectedCameraReady (map, expectedMapState) {
  if (!expectedMapState) {
    return true
  }
  const center = map.getCenter()
  return (
    Math.abs(center.lat - expectedMapState.latitude) < cameraCoordinateTolerance &&
    Math.abs(center.lng - expectedMapState.longitude) < cameraCoordinateTolerance &&
    Math.abs(map.getZoom() - expectedMapState.zoom) < cameraZoomTolerance
  )
}

// isBasemapReady checks that map style and base tiles are fully loaded for the expected camera.
function isBasemapReady (map, expectedMapState) {
  if (!map) {
    return false
  }
  return Boolean(map.isStyleLoaded() && map.areTilesLoaded() && isExpectedCameraReady(map, expectedMapState))
}

// useBasemapReady tracks map readiness for snapshot rendering flow.
export function useBasemapReady (snapshot, mapboxRef, onReadyChange, expectedMapState) {
  useEffect(() => {
    if (!snapshot || !mapboxRef) {
      onReadyChange(false)
      return
    }
    const map = mapboxRef.getMap()
    if (!map) {
      onReadyChange(false)
      return
    }
    function publishReady () {
      onReadyChange(isBasemapReady(map, expectedMapState))
    }
    // why: map can already be idle before listener registration.
    publishReady()
    map.on('idle', publishReady)
    map.on('render', publishReady)
    map.on('sourcedata', publishReady)
    map.on('styledata', publishReady)
    return function cleanupBasemapReady () {
      map.off('idle', publishReady)
      map.off('render', publishReady)
      map.off('sourcedata', publishReady)
      map.off('styledata', publishReady)
      onReadyChange(false)
    }
  }, [snapshot, mapboxRef, onReadyChange, expectedMapState])
}
