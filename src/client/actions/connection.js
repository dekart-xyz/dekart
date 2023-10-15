import { ArchiveConnectionRequest, CreateConnectionRequest, GetConnectionListRequest, Connection, TestConnectionRequest, UpdateConnectionRequest } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { updateDatasetConnection } from './dataset'
import { grpcCall } from './grpc'

export function connectionCreated ({ id, connectionName }) {
  return { type: connectionCreated.name, id, connectionName }
}

export function closeConnectionDialog () {
  return { type: closeConnectionDialog.name }
}

export function editConnection (id) {
  return { type: editConnection.name, id }
}

export function selectConnection (id) {
  return { type: selectConnection.name, id }
}

export function archiveConnection (id) {
  return async (dispatch) => {
    dispatch({ type: archiveConnection.name })
    const request = new ArchiveConnectionRequest()
    request.setConnectionId(id)
    await new Promise((resolve) => {
      dispatch(grpcCall(Dekart.ArchiveConnection, request, resolve))
    })
    dispatch(connectionSaved())
  }
}

export function newConnection (datasetId) {
  return async (dispatch, getState) => {
    dispatch({ type: newConnection.name })
    const connectionName = `Untitled connection ${(new Date()).toLocaleString()}`
    const request = new CreateConnectionRequest()
    request.setConnectionName(connectionName)
    const res = await new Promise((resolve) => {
      dispatch(grpcCall(Dekart.CreateConnection, request, resolve))
    })
    dispatch(updateDatasetConnection(datasetId, res.connection.id))
    dispatch(connectionCreated(res.connection))
  }
}

export function connectionListUpdate (connectionsList) {
  return { type: connectionListUpdate.name, connectionsList }
}

export function getConnectionsList () {
  return async (dispatch, getState) => {
    dispatch({ type: getConnectionsList.name })
    const request = new GetConnectionListRequest()
    const res = await new Promise((resolve) => {
      dispatch(grpcCall(Dekart.GetConnectionList, request, resolve))
    })
    dispatch(connectionListUpdate(res.connectionsList))
  }
}

export function connectionSaved () {
  return { type: connectionSaved.name }
}

export function saveConnection (id, connectionProps) {
  return async (dispatch, getState) => {
    dispatch({ type: saveConnection.name })
    const request = new UpdateConnectionRequest()
    const connection = new Connection()
    connection.setId(id)
    connection.setConnectionName(connectionProps.connectionName)
    connection.setBigqueryProjectId(connectionProps.bigqueryProjectId)
    connection.setCloudStorageBucket(connectionProps.cloudStorageBucket)
    request.setConnection(connection)
    await new Promise((resolve) => {
      dispatch(grpcCall(Dekart.UpdateConnection, request, resolve))
    })
    dispatch(connectionSaved())
  }
}

export function connectionChanged ({ connectionName, bigqueryProjectId, cloudStorageBucket }) {
  return { type: connectionChanged.name, connectionName, bigqueryProjectId, cloudStorageBucket }
}

export function testConnectionResponse ({ success, error }) {
  return { type: testConnectionResponse.name, success, error }
}

export function testConnection ({ connectionName, bigqueryProjectId, cloudStorageBucket }) {
  return async (dispatch, getState) => {
    dispatch({ type: testConnection.name })
    const request = new TestConnectionRequest()
    const connection = new Connection()
    connection.setConnectionName(connectionName)
    connection.setBigqueryProjectId(bigqueryProjectId)
    connection.setCloudStorageBucket(cloudStorageBucket)
    request.setConnection(connection)
    const res = await new Promise((resolve) => {
      dispatch(grpcCall(Dekart.TestConnection, request, resolve))
    })
    dispatch(testConnectionResponse(res))
  }
}
