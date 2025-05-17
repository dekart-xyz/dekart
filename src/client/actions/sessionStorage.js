const SESSION_STORAGE_KEY = 'dekart-session-storage-v1'

const initialState = {
  isPlayground: false,
  lastOpenedDialog: null, // connection dialog state
  redirectWhenSaveConnection: null // { reportId, edit }
}

let current = initialState

export default function sessionStorageReset () {
  window.sessionStorage.removeItem(SESSION_STORAGE_KEY)
  return {
    type: sessionStorageReset.name,
    current: initialState
  }
}

export function sessionStorageInit () {
  return {
    type: sessionStorageInit.name,
    current
  }
}

export function updateSessionStorage (key, value) {
  current[key] = value
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(current))
  return {
    type: updateSessionStorage.name,
    current
  }
}

export function loadSessionStorage () {
  return (dispatch) => {
    const sessionStorageValue = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (sessionStorageValue) {
      current = JSON.parse(sessionStorageValue)
    }
    dispatch(sessionStorageInit())
  }
}
