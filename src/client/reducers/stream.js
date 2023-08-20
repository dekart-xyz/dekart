import { grpcStream as streamAction } from '../actions/grpc'

const defaultStreamState = {
  cancelable: null
}

export function stream (state = defaultStreamState, action) {
  switch (action.type) {
    case streamAction.name:
      return { ...state, cancelable: action.cancelable }
    default:
      return state
  }
}
