import { combineReducers } from 'redux'
import { userStreamUpdate } from '../actions/user'
import { localStorageInit } from '../actions/localStorage'

function stream (state = null, action) {
  switch (action.type) {
    case userStreamUpdate.name:
      return {
        email: action.userStream.email,
        sensitiveScopesGranted: action.userStream.sensitiveScopesGranted
      }
    default:
      return state
  }
}

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

export default combineReducers({
  stream,
  sensitiveScopesGrantedOnce,
  loginHint
})
