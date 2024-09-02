import { combineReducers } from 'redux'
import { needSensitiveScopes, userStreamUpdate } from '../actions/user'
import { localStorageInit } from '../actions/localStorage'
import { setRedirectState } from '../actions/redirect'

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
    case setRedirectState.name: {
      if (action.redirectState.getSensitiveScopesGranted()) {
        return true
      } else {
        return state
      }
    }
    default:
      return state
  }
}

function sensitiveScopesGranted (state = false, action) {
  switch (action.type) {
    case setRedirectState.name: {
      if (action.redirectState.getSensitiveScopesGranted()) {
        return true
      }
      return state
    }
    default:
      return state
  }
}

function sensitiveScopesNeeded (state = false, action) {
  switch (action.type) {
    case needSensitiveScopes.name:
      return true
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

function redirectStateReceived (state = false, action) {
  switch (action.type) {
    case setRedirectState.name:
      return true
    default:
      return state
  }
}

export default combineReducers({
  stream,
  sensitiveScopesGrantedOnce,
  sensitiveScopesNeeded,
  sensitiveScopesGranted,
  loginHint,
  redirectStateReceived
})
