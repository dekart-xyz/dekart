import { updateMap } from '@kepler.gl/actions'

export function setLocation (location) {
  return (dispatch) => {
    dispatch({ type: setLocation.name, location })
    // Dispatch kepler action to set map position and zoom
    const mapUpdate = {
      latitude: location.latitude,
      longitude: location.longitude,
      zoom: 15 // Default zoom level for location tracking
    }
    dispatch(updateMap(mapUpdate))
  }
}
