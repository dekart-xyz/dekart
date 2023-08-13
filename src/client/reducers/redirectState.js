import { setRedirectState } from '../actions/redirectState'

const defaultRedirectState = {
  token: null,
  error: null
}

export function redirectState (state = defaultRedirectState, action) {
  switch (action.type) {
    case setRedirectState.name:
      return {
        error: action.state.error,
        token: JSON.parse(action.state.token)
      }
    default:
      return state
  }
}
