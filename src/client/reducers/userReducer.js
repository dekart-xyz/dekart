import { combineReducers } from 'redux'
import { needSensitiveScopes, userStreamUpdate } from '../actions/user'
import { localStorageInit } from '../actions/localStorage'
import { sessionStorageInit } from '../actions/sessionStorage'
import { setRedirectState } from '../actions/redirect'
import { UserRole } from '../../proto/dekart_pb'

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

function isPlayground (state = false, action) {
  switch (action.type) {
    case sessionStorageInit.name:
      return action.current.isPlayground
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

function isViewer (state = true, action) {
  switch (action.type) {
    case userStreamUpdate.name:
      return action.userStream.role === UserRole.ROLE_VIEWER
    default:
      return state
  }
}

function isAdmin (state = false, action) {
  switch (action.type) {
    case userStreamUpdate.name:
      return action.userStream.role === UserRole.ROLE_ADMIN
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
  isPlayground,
  redirectStateReceived,
  isViewer,
  isAdmin
})
