import { subscriptionUpdate } from '../actions/subscription'

export default function subscription (state = null, action) {
  switch (action.type) {
    case subscriptionUpdate.name:
      return action.subscription
    default:
      return state
  }
}
