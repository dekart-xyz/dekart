import { combineReducers } from 'redux'
import { userStreamUpdate } from '../actions/user'
import { localStorageInit } from '../actions/localStorage'
import { sessionStorageInit } from '../actions/sessionStorage'

function stream (state = null, action) {
  switch (action.type) {
    case userStreamUpdate.name:
      return action.userStream
    default:
      return state
  }
}

// sensitiveScopesGrantedOnce combines backend and local storage state
function sensitiveScopesGrantedOnce (state = false, action) {
  switch (action.type) {
    case localStorageInit.name:
      return action.current.sensitiveScopesGrantedOnce
    case userStreamUpdate.name:
      return action.userStream.sensitiveScopesGrantedOnce
    default:
      return state
  }
}

function loginHint (state = null, action) {
  switch (action.type) {
    case localStorageInit.name:
      return action.current.loginHint || state
    case userStreamUpdate.name:
      return action.userStream.email
    default:
      return state
  }
}

function isPlayground (state = false, action) {
  switch (action.type) {
    case sessionStorageInit.name:
      return action.current.isPlayground
    default:
      return state
  }
}

export default combineReducers({
  stream,
  sensitiveScopesGrantedOnce,
  loginHint,
  isPlayground
})
