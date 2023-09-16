import { grpcStream, grpcStreamCancel } from '../actions/grpc'

export default function stream (state = {}, action) {
  switch (action.type) {
    case grpcStream.name: {
      const { endpoint, cancelable } = action
      return { ...state, [endpoint]: cancelable }
    }
    case grpcStreamCancel.name: {
      const { endpoint } = action
      return { ...state, [endpoint]: null }
    }
    default:
      return state
  }
}
