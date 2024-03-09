import { userStreamUpdate } from '../actions/user'

export default function user (state = null, action) {
  switch (action.type) {
    case userStreamUpdate.name:
      return {
        email: action.userStream.email,
        sensitiveScopesGranted: action.userStream.sensitiveScopesGranted,
        sensitiveScopesGrantedOnce: action.userStream.sensitiveScopesGrantedOnce
      }
    default:
      return state
  }
}
