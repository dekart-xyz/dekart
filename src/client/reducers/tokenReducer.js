import { setRedirectState } from '../actions/redirect'
import { setSnapshotToken } from '../actions/token'

export default function token (state = null, action) {
  switch (action.type) {
    case setRedirectState.name: {
      const tokenJson = action.redirectState.getTokenJson()
      if (tokenJson) {
        return JSON.parse(tokenJson)
      }
      return state
    }
    case setSnapshotToken.name:
      return action.token
    default:
      return state
  }
}
