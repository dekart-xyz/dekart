import { deviceTokensUpdate, getDeviceTokens, revokeDeviceToken } from '../actions/workspace'

const defaultState = {
  list: [],
  loading: false
}

export default function deviceTokens (state = defaultState, action) {
  switch (action.type) {
    case getDeviceTokens.name:
      return {
        ...state,
        loading: true
      }
    case deviceTokensUpdate.name:
      return {
        list: action.tokensList,
        loading: false
      }
    case revokeDeviceToken.name:
      return state
    default:
      return state
  }
}
