import { LOCAL_STORAGE_KEY } from '../lib/constants'

const initialState = {
  sensitiveScopesGrantedOnce: false,
  loginHint: null
}

let current = initialState

export default function localStorageReset () {
  window.localStorage.removeItem(LOCAL_STORAGE_KEY)
  return {
    type: localStorageReset.name,
    current: initialState
  }
}

export function localStorageInit () {
  return {
    type: localStorageInit.name,
    current
  }
}

export function updateLocalStorage (key, value) {
  current[key] = value
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(current))
  return {
    type: updateLocalStorage.name,
    current
  }
}

export function loadLocalStorage () {
  return (dispatch) => {
    const localStorageValue = window.localStorage.getItem(LOCAL_STORAGE_KEY)
    if (localStorageValue) {
      current = JSON.parse(localStorageValue)
    }
    dispatch(localStorageInit())
  }
}
