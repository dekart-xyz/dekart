import { GetUsageRequest } from 'dekart-proto/dekart_pb'
import { grpcCall } from './grpc'
import { Dekart } from 'dekart-proto/dekart_pb_service'

export function setUsage (stats) {
  return { type: setUsage.name, stats }
}

export function getUsage () {
  return async dispatch => {
    dispatch({ type: getUsage.name })
    const req = new GetUsageRequest()
    dispatch(grpcCall(Dekart.GetUsage, req, (stats) => {
      dispatch(setUsage(stats))
    }))
  }
}
