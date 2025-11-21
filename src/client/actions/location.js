import { updateMap } from '@kepler.gl/actions'

export function setLocation (location, shouldZoom = false) {
  return (dispatch) => {
    dispatch({ type: setLocation.name, location })
    // Dispatch kepler action to set map position and zoom
    const mapUpdate = {
      latitude: location.latitude,
      longitude: location.longitude
    }
    // Only set zoom when first enabling location tracking
    if (shouldZoom) {
      mapUpdate.zoom = 15 // Default zoom level for location tracking
    }
    dispatch(updateMap(mapUpdate))
  }
}

export function stopLocationTracking () {
  return { type: stopLocationTracking.name }
}
