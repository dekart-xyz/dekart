
const LOCAL_STORAGE_KEY = 'dekart-local-storage-v1'

const initialState = {
  sensitiveScopesGrantedOnce: false,
  loginHint: null
}

let current = initialState

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
