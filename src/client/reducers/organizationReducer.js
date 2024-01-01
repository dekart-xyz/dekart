import { subscriptionUpdate, usersListUpdate } from '../actions/organization'
import { combineReducers } from 'redux'

function subscription (state = null, action) {
  switch (action.type) {
    case subscriptionUpdate.name:
      return action.subscription
    default:
      return state
  }
}

function users (state = null, action) {
  switch (action.type) {
    case usersListUpdate.name:
      return action.usersList
    default:
      return state
  }
}

export default combineReducers({
  subscription,
  users
})
