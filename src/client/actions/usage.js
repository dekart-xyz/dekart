import { GetUsageRequest } from '../../proto/dekart_pb'
import { unary } from '../lib/grpc'
import { Dekart } from '../../proto/dekart_pb_service'
import { error } from './message'

export function setUsage (stats) {
  return { type: setUsage.name, stats }
}

export function getUsage () {
  return async dispatch => {
    dispatch({ type: getUsage.name })
    const req = new GetUsageRequest()
    try {
      const stats = await unary(Dekart.GetUsage, req)
      dispatch(setUsage(stats))
    } catch (err) {
      dispatch(error(err))
    }
  }
}
