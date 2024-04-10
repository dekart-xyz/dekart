import { GetUserStreamRequest } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { getConnectionsList } from './connection'
import { grpcStream, grpcStreamCancel } from './grpc'
import { updateLocalStorage } from './localStorage'

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
      connectionUpdate: 0
    }
    dispatch(grpcStream(Dekart.GetUserStream, request, (message, err) => {
      if (message) {
        dispatch(updateLocalStorage('sensitiveScopesGrantedOnce', message.sensitiveScopesGrantedOnce))
        dispatch(updateLocalStorage('loginHint', message.email))
        dispatch(userStreamUpdate(message))
        if (prevRes.connectionUpdate !== message.connectionUpdate) {
          prevRes.connectionUpdate = message.connectionUpdate
          dispatch(getConnectionsList())
        }
      }
      return err
    }))
  }
}

export function unsubscribeUserStream () {
  return (dispatch, getState) => {
    dispatch(grpcStreamCancel(Dekart.GetUserStream))
    dispatch({ type: unsubscribeUserStream.name })
  }
}
