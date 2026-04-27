import { useEffect } from 'react'

// isBasemapReady checks that map style and base tiles are fully loaded.
function isBasemapReady (map) {
  if (!map) {
    return false
  }
  return Boolean(map.isStyleLoaded() && map.areTilesLoaded())
}

// useBasemapReady tracks map readiness for snapshot rendering flow.
export function useBasemapReady (snapshot, mapboxRef, onReadyChange) {
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
      onReadyChange(isBasemapReady(map))
    }
    // why: map can already be idle before listener registration.
    publishReady()
    map.on('idle', publishReady)
    return function cleanupBasemapReady () {
      map.off('idle', publishReady)
      onReadyChange(false)
    }
  }, [snapshot, mapboxRef, onReadyChange])
}
