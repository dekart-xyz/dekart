import { ArchiveSourceRequest, CreateSourceRequest, GetSourceListRequest, Source, TestConnectionRequest, UpdateSourceRequest } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { grpcCall } from './grpc'

export function connectionCreated ({ id, sourceName }) {
  return { type: connectionCreated.name, id, sourceName }
}

export function closeConnectionDialog () {
  return { type: closeConnectionDialog.name }
}

export function editSource (id) {
  return { type: editSource.name, id }
}

export function selectSource (id) {
  return { type: selectSource.name, id }
}

export function archiveSource (id) {
  return async (dispatch) => {
    dispatch({ type: archiveSource.name })
    const request = new ArchiveSourceRequest()
    request.setSourceId(id)
    await new Promise((resolve) => {
      dispatch(grpcCall(Dekart.ArchiveSource, request, resolve))
    })
    dispatch(sourceSaved())
  }
}

export function newConnection () {
  return async (dispatch) => {
    dispatch({ type: newConnection.name })
    const sourceName = `New ${(new Date()).toLocaleString()}`
    const request = new CreateSourceRequest()
    request.setSourceName(sourceName)
    const res = await new Promise((resolve) => {
      dispatch(grpcCall(Dekart.CreateSource, request, resolve))
    })
    dispatch(connectionCreated(res.source))
  }
}

export function sourceListUpdate (sourcesList) {
  return { type: sourceListUpdate.name, sourcesList }
}

export function getSourceList () {
  return async (dispatch, getState) => {
    dispatch({ type: getSourceList.name })
    const request = new GetSourceListRequest()
    const res = await new Promise((resolve) => {
      dispatch(grpcCall(Dekart.GetSourceList, request, resolve))
    })
    dispatch(sourceListUpdate(res.sourcesList))
  }
}

export function sourceSaved () {
  return { type: sourceSaved.name }
}

export function saveConnection (id, sourceProps) {
  return async (dispatch, getState) => {
    dispatch({ type: saveConnection.name })
    const request = new UpdateSourceRequest()
    const source = new Source()
    source.setId(id)
    source.setSourceName(sourceProps.sourceName)
    source.setBigqueryProjectId(sourceProps.bigqueryProjectId)
    source.setCloudStorageBucket(sourceProps.cloudStorageBucket)
    request.setSource(source)
    await new Promise((resolve) => {
      dispatch(grpcCall(Dekart.UpdateSource, request, resolve))
    })
    dispatch(sourceSaved())
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
