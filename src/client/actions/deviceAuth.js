import { AuthorizeDeviceRequest } from 'dekart-proto/dekart_pb'
import { Dekart } from 'dekart-proto/dekart_pb_service'
import { grpcCall } from './grpc'

// authorizeDevice confirms a pending device session for the current user and workspace.
export function authorizeDevice (deviceId) {
  return async (dispatch) => {
    dispatch({ type: authorizeDevice.name, deviceId })
    const request = new AuthorizeDeviceRequest()
    request.setDeviceId(deviceId)
    return await new Promise((resolve, reject) => {
      dispatch(grpcCall(
        Dekart.AuthorizeDevice,
        request,
        (response) => resolve(response),
        (err) => {
          reject(err)
          return null
        }
      ))
    })
  }
}
