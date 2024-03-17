import { CancelSubscriptionRequest, CreateWorkspaceRequest, CreateSubscriptionRequest, GetInvitesRequest, GetWorkspaceRequest, GetStripePortalSessionRequest, ListUsersRequest, RespondToInviteRequest, UpdateWorkspaceRequest, UpdateWorkspaceUserRequest } from '../../proto/dekart_pb'
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

export function createWorkspace (name) {
  return (dispatch) => {
    dispatch({ type: createWorkspace.name })
    const request = new CreateWorkspaceRequest()
    request.setWorkspaceName(name)
    dispatch(grpcCall(Dekart.CreateWorkspace, request, () => {
      success('Workspace created')
    }))
  }
}

export function updateWorkspace (name) {
  return (dispatch) => {
    dispatch({ type: updateWorkspace.name })
    const request = new UpdateWorkspaceRequest()
    request.setWorkspaceName(name)
    dispatch(grpcCall(Dekart.UpdateWorkspace, request, () => {
      success('Workspace updated')
    }))
  }
}

export function workspaceUpdate ({ workspace, subscription, usersList, invitesList, addedUsersCount }) {
  return {
    type: workspaceUpdate.name,
    workspace,
    subscription,
    usersList,
    invitesList,
    addedUsersCount
  }
}

export function getWorkspace () {
  return (dispatch) => {
    dispatch({ type: getWorkspace.name })
    const request = new GetWorkspaceRequest()
    dispatch(grpcCall(Dekart.GetWorkspace, request, (response) => {
      dispatch(workspaceUpdate(response))
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
      dispatch(invitesUpdate(response.invitesList))
    }))
  }
}

export function updateWorkspaceUser (email, userUpdateType) {
  return (dispatch) => {
    dispatch({ type: updateWorkspaceUser.name })
    const request = new UpdateWorkspaceUserRequest()
    request.setEmail(email)
    request.setUserUpdateType(userUpdateType)
    dispatch(grpcCall(Dekart.UpdateWorkspaceUser, request, () => {
      if (userUpdateType === UpdateWorkspaceUserRequest.UserUpdateType.USER_UPDATE_TYPE_ADD) {
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
