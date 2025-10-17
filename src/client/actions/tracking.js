import { TrackEventRequest } from 'dekart-proto/dekart_pb'
import { Dekart } from 'dekart-proto/dekart_pb_service'
import { grpcCall } from './grpc'

export function trackEventToServer (eventName, eventDataProps) {
  return async (dispatch, getState) => {
    const { env } = getState()
    if (!env.isCloud) {
      return
    }
    const request = new TrackEventRequest()
    request.setEventName(eventName)
    request.setEventDataJson(JSON.stringify(eventDataProps))

    // Fire and forget - we don't care about the response or errors
    // This is silently handled by the grpcCall function
    dispatch(grpcCall(Dekart.TrackEvent, request))
  }
}
