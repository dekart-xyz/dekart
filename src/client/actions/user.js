import { GetUserStreamRequest } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { getConnectionsList } from './connection'
import { grpcStream, grpcStreamCancel } from './grpc'

export function subscribeUserStream () {
  return (dispatch) => {
    dispatch({ type: subscribeUserStream.name })
    const request = new GetUserStreamRequest()
    const prevRes = {
      connectionUpdate: 0
    }
    // const request = new ReportListRequest()
    console.log('subscribeUserStream')
    dispatch(grpcStream(Dekart.GetUserStream, request, (message, err) => {
      console.log('subscribeUserStream message', message, err)
      if (message) {
        if (prevRes.connectionUpdate !== message.connectionUpdate) {
          prevRes.connectionUpdate = message.connectionUpdate
          console.log('subscribeUserStream getConnectionsList')
          dispatch(getConnectionsList())
        }
        // dispatch(reportsListUpdate(message.reportsList))
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
