export const DEFAULT_MAP_STATE = {
  longitude: -122.4194,
  latitude: 37.7749,
  zoom: 10
}

// Parse Kepler map config and return mapState when present.
export function parseMapState (mapConfigStr) {
  try {
    const mapConfig = JSON.parse(mapConfigStr)
    return mapConfig?.config?.mapState || null
  } catch {
    return null
  }
}

// Extract center coordinates from map config with SF fallback.
export function getMapCenterCoordinates (mapConfigStr) {
  const mapState = parseMapState(mapConfigStr)
  if (!mapState || mapState.latitude == null || mapState.longitude == null) {
    return {
      latitude: DEFAULT_MAP_STATE.latitude,
      longitude: DEFAULT_MAP_STATE.longitude
    }
  }
  return {
    latitude: mapState.latitude,
    longitude: mapState.longitude
  }
}
