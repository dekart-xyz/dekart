import { CreateSourceRequest, Source, TestConnectionRequest } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { grpcCall } from './grpc'

export function connectionCreated ({ id, sourceName }) {
  return { type: connectionCreated.name, id, sourceName }
}

export function newConnection () {
  return async (dispatch, getState) => {
    dispatch({ type: newConnection.name })
    const sourceName = `New connection ${Date.now().toLocaleString()}}`
    const request = new CreateSourceRequest()
    request.setSourceName(sourceName)
    const res = await new Promise((resolve) => {
      dispatch(grpcCall(Dekart.CreateSource, request, resolve))
    })
    dispatch(connectionCreated(res.source))
  }
}

export function connectionChanged ({ sourceName, bigqueryProjectId, cloudStorageBucket }) {
  return { type: connectionChanged.name, sourceName, bigqueryProjectId, cloudStorageBucket }
}

export function testConnectionResponse ({ success, error }) {
  return { type: testConnectionResponse.name, success, error }
}

export function testConnection ({ sourceName, bigqueryProjectId, cloudStorageBucket }) {
  return async (dispatch, getState) => {
    dispatch({ type: testConnection.name })
    const request = new TestConnectionRequest()
    const source = new Source()
    source.setSourceName(sourceName)
    source.setBigqueryProjectId(bigqueryProjectId)
    source.setCloudStorageBucket(cloudStorageBucket)
    request.setSource(source)
    const res = await new Promise((resolve) => {
      dispatch(grpcCall(Dekart.TestConnection, request, resolve))
    })
    dispatch(testConnectionResponse(res))
  }
}