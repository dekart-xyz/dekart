import { setRedirectState } from '../actions/redirectState'

export function token (state = null, action) {
  switch (action.type) {
    case setRedirectState.name: {
      const tokenJson = action.redirectState.getTokenJson()
      if (tokenJson) {
        return JSON.parse(tokenJson)
      }
      return state
    }
    default:
      return state
  }
}
