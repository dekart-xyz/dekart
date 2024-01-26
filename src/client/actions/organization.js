import { CancelSubscriptionRequest, CreateOrganizationRequest, CreateSubscriptionRequest, GetInvitesRequest, GetOrganizationRequest, GetStripePortalSessionRequest, ListUsersRequest, RemoveUserRequest, RespondToInviteRequest, UpdateOrganizationRequest, UpdateOrganizationUserRequest } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { grpcCall } from './grpc'
import { info, success } from './message'

export function redirectToCustomerPortal () {
  return (dispatch) => {
    dispatch({ type: redirectToCustomerPortal.name })
    const request = new GetStripePortalSessionRequest()
    request.setUiUrl(window.location.href)
    dispatch(grpcCall(Dekart.GetStripePortalSession, request, (res) => {
      window.location.href = res.url
    }))
  }
}

export function respondToInvite (inviteId, accept) {
  return (dispatch) => {
    dispatch({ type: respondToInvite.name })
    const request = new RespondToInviteRequest()
    request.setInviteId(inviteId)
    request.setAccept(accept)
    dispatch(grpcCall(Dekart.RespondToInvite, request, () => {
      if (accept) {
        window.location.href = '/'
      } else {
        info('Invite declined')
      }
    }))
  }
}

export function createOrganization (name) {
  return (dispatch) => {
    dispatch({ type: createOrganization.name })
    const request = new CreateOrganizationRequest()
    request.setOrganizationName(name)
    dispatch(grpcCall(Dekart.CreateOrganization, request, () => {
      success('Organization created')
    }))
  }
}

export function updateOrganization (name) {
  return (dispatch) => {
    dispatch({ type: updateOrganization.name })
    const request = new UpdateOrganizationRequest()
    request.setOrganizationName(name)
    dispatch(grpcCall(Dekart.UpdateOrganization, request, () => {
      success('Organization updated')
    }))
  }
}

export function organizationUpdate ({ organization, subscription, usersList, invitesList }) {
  return {
    type: organizationUpdate.name,
    organization,
    subscription,
    usersList,
    invitesList
  }
}

export function getOrganization () {
  return (dispatch) => {
    dispatch({ type: getOrganization.name })
    const request = new GetOrganizationRequest()
    dispatch(grpcCall(Dekart.GetOrganization, request, (response) => {
      console.log(response)
      dispatch(organizationUpdate(response))
    }))
  }
}

export function createSubscription (plantType) {
  return (dispatch) => {
    dispatch({ type: createSubscription.name })
    const request = new CreateSubscriptionRequest()
    request.setPlanType(plantType)
    request.setUiUrl(window.location.href)
    dispatch(grpcCall(Dekart.CreateSubscription, request, (res) => {
      if (res.redirectUrl) {
        window.location.href = res.redirectUrl
      } else {
        success('Subscription created')
      }
    }))
  }
}

export function invitesUpdate (invitesList) {
  return {
    type: invitesUpdate.name,
    invitesList
  }
}

export function getInvites () {
  return (dispatch) => {
    dispatch({ type: getInvites.name })
    const request = new GetInvitesRequest()
    dispatch(grpcCall(Dekart.GetInvites, request, (response) => {
      console.log(response)
      dispatch(invitesUpdate(response.invitesList))
    }))
  }
}

export function updateOrganizationUser (email, userUpdateType) {
  return (dispatch) => {
    dispatch({ type: updateOrganizationUser.name })
    const request = new UpdateOrganizationUserRequest()
    request.setEmail(email)
    request.setUserUpdateType(userUpdateType)
    dispatch(grpcCall(Dekart.UpdateOrganizationUser, request, () => {
      if (userUpdateType === UpdateOrganizationUserRequest.UserUpdateType.USER_UPDATE_TYPE_ADD) {
        success('User invited')
      }
    }))
  }
}

export function cancelSubscription () {
  return (dispatch) => {
    dispatch({ type: cancelSubscription.name })
    const request = new CancelSubscriptionRequest()
    request.setUiUrl(window.location.href)
    dispatch(grpcCall(Dekart.CancelSubscription, request, (res) => {
      console.log('cancelSubscription', res)
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
