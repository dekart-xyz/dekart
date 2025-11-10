import { combineReducers } from 'redux'
import { needSensitiveScopes, setClaimEmailCookie, userStreamUpdate } from '../actions/user'
import { localStorageInit } from '../actions/localStorage'
import { sessionStorageInit } from '../actions/sessionStorage'
import { setRedirectState } from '../actions/redirect'
import { PlanType, UserRole } from 'dekart-proto/dekart_pb'

function claimEmailCookie (state = null, action) {
  switch (action.type) {
    case setClaimEmailCookie.name:
      return action.claimEmailCookie
    default:
      return state
  }
}

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

function isDefaultWorkspace (state = false, action) {
  switch (action.type) {
    case userStreamUpdate.name:
      return action.userStream.isDefaultWorkspace
    default:
      return state
  }
}

function isSelfHosted (state = null, action) {
  switch (action.type) {
    case userStreamUpdate.name:
      return action.userStream.planType === PlanType.TYPE_SELF_HOSTED || action.userStream.isDefaultWorkspace
    default:
      return state
  }
}

function isPlayground (state = false, action) {
  switch (action.type) {
    case sessionStorageInit.name:
      // prevent returning undefined when sessionStorage was deleted
      return Boolean(action.current.isPlayground)
    case userStreamUpdate.name:
      return action.userStream.isPlayground
    default:
      return state
  }
}

function isAnonymous (state = false, action) {
  switch (action.type) {
    case userStreamUpdate.name:
      return action.isAnonymous
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

function isFreemium (state = null, action) {
  switch (action.type) {
    case userStreamUpdate.name:
      return action.userStream.planType === PlanType.TYPE_PERSONAL
    default:
      return state
  }
}

function hasAllFeatures (state = null, action) {
  switch (action.type) {
    case userStreamUpdate.name:
      return [
        PlanType.TYPE_TEAM,
        PlanType.TYPE_GROW,
        PlanType.TYPE_MAX,
        PlanType.TYPE_SELF_HOSTED,
        PlanType.TYPE_TRIAL
      ].includes(action.userStream.planType)
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
  isDefaultWorkspace,
  redirectStateReceived,
  isViewer,
  isAdmin,
  isSelfHosted,
  claimEmailCookie,
  isAnonymous,
  isFreemium,
  hasAllFeatures
})
