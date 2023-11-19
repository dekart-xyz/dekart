import { CreateSubscriptionRequest } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { grpcCall } from './grpc'

export function createSubscription (planType) {
  return (dispatch) => {
    dispatch({ type: createSubscription.name })
    const request = new CreateSubscriptionRequest()
    console.log(planType)
    request.setPlanType(planType)
    request.setUiUrl(window.location.href)
    dispatch(grpcCall(Dekart.CreateSubscription, request, (response) => {
      if (response.redirectUrl) {
        window.location.href = response.redirectUrl
      }
    }))
  }
}
