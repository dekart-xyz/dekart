import { AddUserRequest, CancelSubscriptionRequest, CreateSubscriptionRequest, ListUsersRequest, RemoveUserRequest } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { grpcCall } from './grpc'
import { success } from './message'

export function createSubscription (planType) {
  return (dispatch) => {
    dispatch({ type: createSubscription.name })
    const request = new CreateSubscriptionRequest()
    request.setPlanType(planType)
    request.setUiUrl(window.location.href)
    dispatch(grpcCall(Dekart.CreateSubscription, request, (response) => {
      if (response.redirectUrl) {
        window.location.href = response.redirectUrl
      } else {
        success('Subscription created')
      }
    }))
  }
}

export function removeUser (email) {
  return (dispatch) => {
    dispatch({ type: removeUser.name })
    const request = new RemoveUserRequest()
    request.setEmail(email)
    dispatch(grpcCall(Dekart.RemoveUser, request, () => {
      success('User removed')
    }))
  }
}

export function addUser (email) {
  return (dispatch) => {
    dispatch({ type: addUser.name })
    const request = new AddUserRequest()
    request.setEmail(email)
    dispatch(grpcCall(Dekart.AddUser, request, () => {
      success('User added')
    }))
  }
}

export function cancelSubscription () {
  return (dispatch) => {
    dispatch({ type: cancelSubscription.name })
    const request = new CancelSubscriptionRequest()
    dispatch(grpcCall(Dekart.CancelSubscription, request, () => {
      success('Subscription canceled')
    }))
  }
}

export function subscriptionUpdate (subscription) {
  return {
    type: subscriptionUpdate.name,
    subscription
  }
}

export function getSubscription () {
  return (dispatch) => {
    dispatch({ type: getSubscription.name })
    const request = new CreateSubscriptionRequest()
    dispatch(grpcCall(Dekart.GetSubscription, request, response => {
      dispatch(subscriptionUpdate(response.subscription))
    }))
  }
}

export function usersListUpdate (usersList) {
  return {
    type: usersListUpdate.name,
    usersList
  }
}

export function listUsers () {
  return async (dispatch) => {
    dispatch({ type: listUsers.name })
    const request = new ListUsersRequest()
    const res = await new Promise((resolve) => {
      dispatch(grpcCall(Dekart.ListUsers, request, resolve))
    })
    dispatch(usersListUpdate(res.usersList))
  }
}
