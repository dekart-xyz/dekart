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

    return new Promise((resolve, reject) => {
      dispatch(grpcCall(Dekart.TrackEvent, request, resolve, (err) => {
        reject(err)
        return null
      }))
    })
  }
}
