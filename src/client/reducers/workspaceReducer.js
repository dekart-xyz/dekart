import { workspaceUpdate } from '../actions/workspace'

export default function workspace (state = {
  id: null,
  name: null,
  subscription: null,
  users: [],
  invites: [],
  addedUsersCount: NaN,
  expired: null
}, action) {
  switch (action.type) {
    case workspaceUpdate.name:
      return {
        id: action.workspace ? action.workspace.id : null,
        name: action.workspace ? action.workspace.name : null,
        subscription: action.subscription || null,
        users: action.usersList || [],
        invites: action.invitesList || [],
        addedUsersCount: action.addedUsersCount,
        expired: action.subscription ? action.subscription.expired : false
      }
    default:
      return state
  }
}
