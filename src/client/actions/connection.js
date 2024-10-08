import { ArchiveConnectionRequest, CreateConnectionRequest, GetConnectionListRequest, Connection, TestConnectionRequest, UpdateConnectionRequest, SetDefaultConnectionRequest, GetGcpProjectListRequest, Secret } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { grpcCall } from './grpc'
import { updateSessionStorage } from './sessionStorage'
import { needSensitiveScopes } from './user'

export function connectionCreated ({ id, connectionName }) {
  return { type: connectionCreated.name, id, connectionName }
}

export function closeConnectionDialog () {
  return async (dispatch) => {
    dispatch({ type: closeConnectionDialog.name })
  }
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

export function editConnection (id, connectionType) {
  return async (dispatch) => {
    dispatch({ type: editConnection.name, id, connectionType })
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

// newConnectionScreen toggles the new connection screen with datasource selection
export function newConnectionScreen (show) {
  return { type: newConnectionScreen.name, show }
}

// reOpenDialog reopens the last opened dialog after permissions are granted
export function reOpenDialog () {
  return (dispatch, getState) => {
    const { lastOpenedDialog } = getState().connection
    if (lastOpenedDialog) {
      dispatch(updateSessionStorage('lastOpenedDialog', null))
      dispatch(newConnection(lastOpenedDialog.connectionType))
      dispatch({ type: reOpenDialog.name })
    }
  }
}

// newConnection opens a modal to create a new connection
export function newConnection (connectionType) {
  return async (dispatch, getState) => {
    const { user } = getState()
    if (connectionType === Connection.ConnectionType.CONNECTION_TYPE_BIGQUERY && !user.sensitiveScopesGranted) {
      dispatch(updateSessionStorage('lastOpenedDialog', { connectionType })) // remember the dialog state
      dispatch(needSensitiveScopes())
    }
    // just to show the modal
    dispatch({ type: newConnection.name, connectionType })
    if (connectionType === Connection.ConnectionType.CONNECTION_TYPE_BIGQUERY) {
      dispatch(getProjectList())
    }
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

    res.connectionsList.forEach((connection) => {
      // replace password with placeholder
      // no password is returned from the server, only the length
      if (connection.snowflakePassword?.length > 0) {
        connection.snowflakePassword = '*'.repeat(connection.snowflakePassword.length)
      }
    })
    dispatch(connectionListUpdate(res.connectionsList))
  }
}

export function connectionSaved () {
  return { type: connectionSaved.name }
}

export function saveConnection (id, connectionType, connectionProps) {
  return async (dispatch, getState) => {
    const connection = new Connection()
    connection.setConnectionType(connectionType)
    dispatch({ type: saveConnection.name })
    if (!id) {
      // create new connection
      const request = new CreateConnectionRequest()
      if (connectionType === Connection.ConnectionType.CONNECTION_TYPE_SNOWFLAKE) {
        connection.setConnectionName(connectionProps.connectionName)
        connection.setSnowflakeAccountId(connectionProps.snowflakeAccountId)
        connection.setSnowflakeUsername(connectionProps.snowflakeUsername)
        connection.setSnowflakeWarehouse(connectionProps.snowflakeWarehouse)
        const secret = new Secret()
        secret.setClientEncrypted(await encryptPassword(connectionProps.snowflakePassword, getState().env.variables.AES_KEY, getState().env.variables.AES_IV))
        connection.setSnowflakePassword(secret)
      } else {
        connection.setConnectionName(connectionProps.connectionName)
        connection.setBigqueryProjectId(connectionProps.bigqueryProjectId)
        connection.setCloudStorageBucket(connectionProps.cloudStorageBucket)
      }
      request.setConnection(connection)

      const res = await new Promise((resolve) => {
        dispatch(grpcCall(Dekart.CreateConnection, request, resolve))
      })

      dispatch(connectionCreated(res.connection))
    } else {
      const prevConnection = getState().connection.list.find(c => c.id === id)

      // update existing connection
      const request = new UpdateConnectionRequest()
      connection.setId(id)
      if (connectionType === Connection.ConnectionType.CONNECTION_TYPE_SNOWFLAKE) {
        connection.setConnectionName(connectionProps.connectionName)
        connection.setSnowflakeAccountId(connectionProps.snowflakeAccountId)
        connection.setSnowflakeUsername(connectionProps.snowflakeUsername)
        connection.setSnowflakeWarehouse(connectionProps.snowflakeWarehouse)
        if (prevConnection?.snowflakePassword !== connectionProps.snowflakePassword) {
          // update password only if it was changed, otherwise it's just a placeholder
          const secret = new Secret()
          secret.setClientEncrypted(await encryptPassword(connectionProps.snowflakePassword, getState().env.variables.AES_KEY, getState().env.variables.AES_IV))
          connection.setSnowflakePassword(secret)
        }
      } else {
        connection.setConnectionName(connectionProps.connectionName)
        connection.setBigqueryProjectId(connectionProps.bigqueryProjectId)
        connection.setCloudStorageBucket(connectionProps.cloudStorageBucket)
      }
      request.setConnection(connection)

      await new Promise((resolve) => {
        dispatch(grpcCall(Dekart.UpdateConnection, request, resolve))
      })
    }

    dispatch(connectionSaved())
  }
}

export function connectionChanged () {
  return { type: connectionChanged.name }
}

export function testConnectionResponse ({ success, error }) {
  return { type: testConnectionResponse.name, success, error }
}

async function encryptPassword (password, key, iv) {
  // Convert key and IV from Base64
  const keyArrayBuffer = await window.crypto.subtle.importKey(
    'raw',
    base64ToArrayBuffer(key),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  )
  const ivArray = base64ToArrayBuffer(iv)

  // Encrypt the password
  const encoder = new TextEncoder()
  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(ivArray)
    },
    keyArrayBuffer,
    encoder.encode(password)
  )

  // Convert encrypted data to Base64 for easy transmission
  const encryptedBase64 = arrayBufferToBase64(encrypted)
  return encryptedBase64
}

function base64ToArrayBuffer (base64) {
  const binaryString = window.atob(base64)
  const len = binaryString.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

function arrayBufferToBase64 (buffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary)
}

export function testConnection (connectionType, values) {
  return async (dispatch, getState) => {
    dispatch({ type: testConnection.name })
    const { env: { variables: { AES_IV, AES_KEY } } } = getState()
    const request = new TestConnectionRequest()
    const connection = new Connection()
    connection.setConnectionType(connectionType)
    if (connectionType === Connection.ConnectionType.CONNECTION_TYPE_SNOWFLAKE) {
      const { connectionName, snowflakeAccountId, snowflakeUsername, snowflakeWarehouse, snowflakePassword } = values
      connection.setConnectionName(connectionName)
      connection.setSnowflakeAccountId(snowflakeAccountId)
      connection.setSnowflakeUsername(snowflakeUsername)
      connection.setSnowflakeWarehouse(snowflakeWarehouse)
      const secret = new Secret()
      secret.setClientEncrypted(await encryptPassword(snowflakePassword, AES_KEY, AES_IV))
      connection.setSnowflakePassword(secret)
    } else { // bigquery
      const { connectionName, bigqueryProjectId, cloudStorageBucket } = values
      connection.setConnectionName(connectionName)
      connection.setBigqueryProjectId(bigqueryProjectId)
      connection.setCloudStorageBucket(cloudStorageBucket)
    }

    request.setConnection(connection)

    const res = await new Promise((resolve) => {
      dispatch(grpcCall(Dekart.TestConnection, request, resolve))
    })

    dispatch(testConnectionResponse(res))
  }
}
