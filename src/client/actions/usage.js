import { GetUsageRequest } from '../../proto/dekart_pb'
import { grpcCall } from '../lib/grpc'
import { Dekart } from '../../proto/dekart_pb_service'

export function setUsage (stats) {
  return { type: setUsage.name, stats }
}

export function getUsage () {
  return async dispatch => {
    dispatch({ type: getUsage.name })
    const req = new GetUsageRequest()
    dispatch(grpcCall(Dekart.GetUsage, req, (stats, err) => {
      if (err) {
        return err
      }
      dispatch(setUsage(stats))
    }))
  }
}
