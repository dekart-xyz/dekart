import { setHttpError } from '../actions/message'
import { authRedirect, setRedirectState } from '../actions/redirect'

export default function httpError (state = {}, action) {
  switch (action.type) {
    case setHttpError.name: {
      if (action.status === 401 && state.doNotAuthenticate) {
        // just keep showing auth error, do not override it with other 401
        return state
      } else if (state.redirecting) {
        // do nothing as page is getting redirected and requests are getting cancelled
        return state
      } else {
        return {
          status: action.status,
          message: action.message,
          doNotAuthenticate: false
        }
      }
    }
    case authRedirect.name: {
      return {
        ...state,
        redirecting: true
      }
    }
    case setRedirectState.name: {
      const err = action.redirectState.getError()
      if (err) {
        return {
          status: 401,
          message: err,
          doNotAuthenticate: true
        }
      } else {
        return {} // reset error
      }
    }
    default:
      return state
  }
}
