import { ArchiveConnectionRequest, CreateConnectionRequest, GetConnectionListRequest, Connection, TestConnectionRequest, UpdateConnectionRequest, SetDefaultConnectionRequest, GetGcpProjectListRequest } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { grpcCall } from './grpc'

export function connectionCreated ({ id, connectionName }) {
  return { type: connectionCreated.name, id, connectionName }
}

export function closeConnectionDialog () {
  return { type: closeConnectionDialog.name }
}

export function projectListUpdate (projectsList) {
  return { type: projectListUpdate.name, projectsList }
}

export function getProjectList () {
  return async (dispatch) => {
    dispatch({ type: getProjectList.name })
    const request = new GetGcpProjectListRequest()
    const res = await new Promise((resolve, reject) => {
      dispatch(grpcCall(Dekart.GetGcpProjectList, request, resolve, (err) => {
        resolve({ projectsList: [] })
        if (err.code === 7) {
          // insufficient permissions for scopes
          return
        }
        return err
      }))
    })
    dispatch(projectListUpdate(res.projectsList))
  }
}

export function editConnection (id) {
  return async (dispatch) => {
    dispatch({ type: editConnection.name, id })
    dispatch(getProjectList())
  }
}

export function selectConnection (id) {
  return { type: selectConnection.name, id }
}

export function setDefaultConnection (id) {
  return async (dispatch) => {
    dispatch({ type: setDefaultConnection.name })

    const request = new SetDefaultConnectionRequest()
    request.setConnectionId(id)

    await new Promise((resolve) => {
      dispatch(grpcCall(Dekart.SetDefaultConnection, request, resolve))
    })

    dispatch(connectionSaved())
  }
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

export function newConnection () {
  return async (dispatch) => {
    // just to show the modal
    dispatch({ type: newConnection.name })
    dispatch(getProjectList())
  }
}

export function connectionListUpdate (connectionsList) {
  return { type: connectionListUpdate.name, connectionsList }
}

export function getConnectionsList () {
  return async (dispatch) => {
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
    if (!id) {
      // create new connection
      const request = new CreateConnectionRequest()
      const connection = new Connection()
      connection.setConnectionName(connectionProps.connectionName)
      connection.setBigqueryProjectId(connectionProps.bigqueryProjectId)
      connection.setCloudStorageBucket(connectionProps.cloudStorageBucket)
      request.setConnection(connection)

      const res = await new Promise((resolve) => {
        dispatch(grpcCall(Dekart.CreateConnection, request, resolve))
      })

      dispatch(connectionCreated(res.connection))
    } else {
      // update existing connection
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
    }

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
