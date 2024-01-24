import { GetUserStreamRequest } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { getConnectionsList } from './connection'
import { grpcStream, grpcStreamCancel } from './grpc'
import { getInvites, getOrganization, getSubscription, listUsers } from './organization'

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
      organizationUpdate: -1
    }
    dispatch(grpcStream(Dekart.GetUserStream, request, (message, err) => {
      if (message) {
        dispatch(userStreamUpdate(message))
        if (prevRes.organizationUpdate !== message.organizationUpdate) {
          prevRes.organizationUpdate = message.organizationUpdate
          dispatch(getOrganization())
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

export function unsubscribeUserStream () {
  return (dispatch, getState) => {
    dispatch(grpcStreamCancel(Dekart.GetUserStream))
    dispatch({ type: unsubscribeUserStream.name })
  }
}
