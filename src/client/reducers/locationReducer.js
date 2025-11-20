import { setLocation } from '../actions/location'

const defaultLocation = {
  latitude: null,
  longitude: null,
  heading: null
}

export default function location (state = defaultLocation, action) {
  switch (action.type) {
    case setLocation.name:
      return {
        latitude: action.location.latitude,
        longitude: action.location.longitude,
        heading: action.location.heading ?? null
      }
    default:
      return state
  }
}
