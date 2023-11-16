import { CreateSubscriptionRequest } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { grpcCall } from './grpc'

export function createSubscription () {
  return (dispatch) => {
    dispatch({ type: createSubscription.name })
    const request = new CreateSubscriptionRequest()
    dispatch(grpcCall(Dekart.CreateSubscription, request))
  }
}
