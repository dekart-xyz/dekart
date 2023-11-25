import { CancelSubscriptionRequest, CreateSubscriptionRequest } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { grpcCall } from './grpc'
import { success } from './message'

export function createSubscription (planType) {
  return (dispatch) => {
    dispatch({ type: createSubscription.name })
    const request = new CreateSubscriptionRequest()
    request.setPlanType(planType)
    request.setUiUrl(window.location.href)
    dispatch(grpcCall(Dekart.CreateSubscription, request, (response) => {
      if (response.redirectUrl) {
        window.location.href = response.redirectUrl
      } else {
        success('Subscription created')
      }
    }))
  }
}

export function cancelSubscription () {
  return (dispatch) => {
    dispatch({ type: cancelSubscription.name })
    const request = new CancelSubscriptionRequest()
    dispatch(grpcCall(Dekart.CancelSubscription, request, () => {
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
