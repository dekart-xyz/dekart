import { GetUserStreamRequest, SwitchPlaygroundRequest } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { getConnectionsList } from './connection'
import { grpcCall, grpcStream, grpcStreamCancel } from './grpc'
import { updateLocalStorage } from './localStorage'
import { getWorkspace } from './workspace'

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
      connectionUpdate: 0,
      workspaceUpdate: -1
    }
    dispatch(grpcStream(Dekart.GetUserStream, request, (message, err) => {
      if (message) {
        dispatch(updateLocalStorage('sensitiveScopesGrantedOnce', message.sensitiveScopesGrantedOnce))
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

export function switchPlayground (isPlayground) {
  return (dispatch, getState) => {
    const request = new SwitchPlaygroundRequest()
    request.setIsPlayground(isPlayground)
    dispatch(grpcCall(Dekart.SwitchPlayground, request, () => {
      // reload page to apply new permissions
      window.location.href = '/'
    }))
  }
}

export function unsubscribeUserStream () {
  return (dispatch, getState) => {
    dispatch(grpcStreamCancel(Dekart.GetUserStream))
    dispatch({ type: unsubscribeUserStream.name })
  }
}
