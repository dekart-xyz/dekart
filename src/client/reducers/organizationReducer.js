import { organizationUpdate } from '../actions/organization'

export default function organization (state = {
  id: null,
  name: null,
  subscription: null,
  users: [],
  invites: []
}, action) {
  switch (action.type) {
    case organizationUpdate.name:
      return {
        id: action.organization ? action.organization.id : null,
        name: action.organization ? action.organization.name : null,
        subscription: action.subscription || null,
        users: action.usersList || [],
        invites: action.invitesList || []
      }
    default:
      return state
  }
}
