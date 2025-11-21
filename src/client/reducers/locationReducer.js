import { setLocation, stopLocationTracking } from '../actions/location'

export default function location (state = null, action) {
  switch (action.type) {
    case setLocation.name:
      return {
        latitude: action.location.latitude,
        longitude: action.location.longitude,
        heading: action.location.heading ?? null,
        precision: action.location.precision ?? null
      }
    case stopLocationTracking.name:
      return null
    default:
      return state
  }
}
