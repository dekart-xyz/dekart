import { GetUserStreamRequest } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { getSourceList } from './connection'
import { grpcStream, grpcStreamCancel } from './grpc'

export function subscribeUserStream () {
  return (dispatch) => {
    dispatch({ type: subscribeUserStream.name })
    const request = new GetUserStreamRequest()
    const prevRes = {
      sourceUpdate: 0
    }
    // const request = new ReportListRequest()
    console.log('subscribeUserStream')
    dispatch(grpcStream(Dekart.GetUserStream, request, (message, err) => {
      console.log('subscribeUserStream message', message, err)
      if (message) {
        if (prevRes.sourceUpdate !== message.sourceUpdate) {
          prevRes.sourceUpdate = message.sourceUpdate
          dispatch(getSourceList())
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
