import { AuthState } from '../../proto/dekart_pb'
import { updateLocalStorage } from './localStorage'

export function setRedirectState (redirectState) {
  return async (dispatch) => {
    dispatch({ type: setRedirectState.name, redirectState })
    if (redirectState.getSensitiveScopesGranted()) {
      // remember that the user has granted sensitive scopes on this device once
      dispatch(updateLocalStorage('sensitiveScopesGrantedOnce', true))
    }
  }
}

export function requestSensitiveScopes (returnPath) {
  return async (dispatch) => {
    const url = new URL(window.location.href)
    url.pathname = returnPath
    const state = new AuthState()
    state.setUiUrl(url.href)
    state.setAction(AuthState.Action.ACTION_REQUEST_CODE)
    state.setSensitiveScope(true)
    dispatch(authRedirect(state))
  }
}

const { REACT_APP_API_HOST } = process.env // this never changes, passed during build

// authRedirect will redirect the browser to the authentication endpoint
export function authRedirect (state) {
  return async (dispatch, getState) => {
    dispatch({ type: authRedirect.name })
    const loginHint = getState().user.loginHint
    if (loginHint) {
      state.setLoginHint(loginHint)
    }
    const req = new URL('/api/v1/authenticate', REACT_APP_API_HOST || window.location.href)
    state.setAuthUrl(req.href)
    const stateBase64 = btoa(String.fromCharCode.apply(null, state.serializeBinary()))
    req.searchParams.set('state', stateBase64)
    window.location.href = req.href
  }
}
