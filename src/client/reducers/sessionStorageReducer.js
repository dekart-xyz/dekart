import { combineReducers } from 'redux'
import sessionStorageReset, { sessionStorageInit, updateSessionStorage } from '../actions/sessionStorage'

function current (state = null, action) {
  switch (action.type) {
    case sessionStorageReset.name:
    case sessionStorageInit.name:
      return action.current
    case updateSessionStorage.name:
      return action.current
    default:
      return state
  }
}

function init (state = false, action) {
  switch (action.type) {
    case sessionStorageInit.name:
      return true
    default:
      return state
  }
}

export default combineReducers({
  current,
  init
})
