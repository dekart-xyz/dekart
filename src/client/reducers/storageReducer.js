import { localStorageInit } from '../actions/localStorage'
import { sessionStorageInit } from '../actions/sessionStorage'

const initialState = {
  loaded: false, // both loaded
  sessionStorageLoaded: false,
  localStorageLoaded: false
}

export default function storage (state = initialState, action) {
  switch (action.type) {
    case sessionStorageInit.name:
      return {
        ...state,
        loaded: state.localStorageLoaded, // both loaded
        sessionStorageLoaded: true
      }
    case localStorageInit.name:
      return {
        ...state,
        loaded: state.sessionStorageLoaded, // both loaded
        localStorageLoaded: true
      }
    default:
      return state
  }
}
