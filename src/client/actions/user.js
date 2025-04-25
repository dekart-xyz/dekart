import { GetUserStreamRequest } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { getConnectionsList } from './connection'
import { grpcStream, grpcStreamCancel } from './grpc'
import { updateLocalStorage } from './localStorage'
import { updateSessionStorage } from './sessionStorage'
import { getWorkspace } from './workspace'

export function setClaimEmailCookie () {
  const claimEmailCookie = document.cookie
    .split('; ')
    .find(row => row.startsWith('dekart-dev-claim-email='))?.split('=')[1] || null
  return { type: setClaimEmailCookie.name, claimEmailCookie }
}

export function userStreamUpdate (userStream) {
  return {
    type: userStreamUpdate.name,
    userStream
  }
}

export function subscribeUserStream () {
  return (dispatch) => {
    dispatch({ type: subscribeUserStream.name })
    const request = new GetUserStreamRequest()
    const prevRes = {
      connectionUpdate: -1,
      workspaceUpdate: -1
    }
    dispatch(grpcStream(Dekart.GetUserStream, request, (message, err) => {
      if (message) {
        dispatch(updateLocalStorage('loginHint', message.email))
        dispatch(userStreamUpdate(message))
        if (prevRes.workspaceUpdate !== message.workspaceUpdate) {
          prevRes.workspaceUpdate = message.workspaceUpdate
          dispatch(getWorkspace())
        }
        if (message.planType > 0) {
          // update only when subscription is active to avoid 404 errors
          if (prevRes.connectionUpdate !== message.connectionUpdate) {
            prevRes.connectionUpdate = message.connectionUpdate
            dispatch(getConnectionsList())
          }
        }
      }
      return err
    }))
  }
}

export function switchPlayground (isPlayground, redirect = '/') {
  return (dispatch, getState) => {
    dispatch(updateSessionStorage('isPlayground', isPlayground))
    window.location.href = redirect
  }
}

export function needSensitiveScopes () {
  return { type: needSensitiveScopes.name }
}

export function unsubscribeUserStream () {
  return (dispatch, getState) => {
    dispatch(grpcStreamCancel(Dekart.GetUserStream))
    dispatch({ type: unsubscribeUserStream.name })
  }
}
