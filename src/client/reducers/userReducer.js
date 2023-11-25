import { userStreamUpdate } from '../actions/user'

export default function user (state = null, action) {
  switch (action.type) {
    case userStreamUpdate.name:
      return {
        email: action.userStream.email
      }
    default:
      return state
  }
}
