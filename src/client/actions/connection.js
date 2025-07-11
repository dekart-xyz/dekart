import { ArchiveConnectionRequest, CreateConnectionRequest, GetConnectionListRequest, Connection, TestConnectionRequest, UpdateConnectionRequest, SetDefaultConnectionRequest, GetGcpProjectListRequest, Secret, ConnectionType, GetWherobotsConnectionHintRequest } from 'dekart-proto/dekart_pb'
import { Dekart } from 'dekart-proto/dekart_pb_service'
import { grpcCall } from './grpc'
import { updateSessionStorage } from './sessionStorage'
import { needSensitiveScopes } from './user'

export const SystemConnectionID = '00000000-0000-0000-0000-000000000000'

export function isSystemConnectionID (connectionID) {
  return (
    connectionID === SystemConnectionID ||
    connectionID === 'default' ||
    connectionID === ''
  )
}

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
        if (err.code === 7) {
          // insufficient permissions for scopes
          resolve({ projectsList: [] })
          return
        }
        return err
      }))
    })
    dispatch(projectListUpdate(res.projectsList))
  }
}

export function editConnection (id, connectionType, bigqueryKey = false) {
  return async (dispatch) => {
    dispatch({ type: editConnection.name, id, connectionType, bigqueryKey })
    dispatch(getConnectionsList()) // get the latest connections list to ensure the connection is up-to-date
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
export function newConnection (connectionType, bigqueryKey = false) {
  return async (dispatch, getState) => {
    const { user } = getState()
    if (connectionType === ConnectionType.CONNECTION_TYPE_BIGQUERY && !user.sensitiveScopesGranted && !bigqueryKey) {
      dispatch(updateSessionStorage('lastOpenedDialog', { connectionType })) // remember the dialog state
      dispatch(needSensitiveScopes())
    }
    // just to show the modal
    dispatch({ type: newConnection.name, connectionType, bigqueryKey })
    if (connectionType === ConnectionType.CONNECTION_TYPE_BIGQUERY && !bigqueryKey) {
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
      // replace key with placeholder
      // no secret is returned from the server, only the length
      if (connection.snowflakeKey?.length > 0) {
        connection.snowflakeKey = '*'.repeat(connection.snowflakeKey.length)
      }
    })
    dispatch(connectionListUpdate(res.connectionsList))
  }
}

export function connectionSaved () {
  return function (dispatch, getState) {
    dispatch({ type: connectionSaved.name })
    const redirectWhenSaveConnection = getState().connection.redirectWhenSaveConnection
    if (redirectWhenSaveConnection) {
      dispatch(updateSessionStorage('redirectWhenSaveConnection', null))
      window.location.href = redirectWhenSaveConnection.edit ? `/reports/${redirectWhenSaveConnection.reportId}/source` : `/reports/${redirectWhenSaveConnection.reportId}`
    }
  }
}

export function saveConnection (id, connectionType, connectionProps) {
  return async (dispatch, getState) => {
    const connection = new Connection()
    connection.setConnectionType(connectionType)
    dispatch({ type: saveConnection.name })
    if (!id) {
      // create new connection
      const request = new CreateConnectionRequest()
      if (connectionType === ConnectionType.CONNECTION_TYPE_SNOWFLAKE) {
        connection.setConnectionName(connectionProps.connectionName || 'Snowflake')
        connection.setSnowflakeAccountId(connectionProps.snowflakeAccountId)
        connection.setSnowflakeUsername(connectionProps.snowflakeUsername)
        connection.setSnowflakeWarehouse(connectionProps.snowflakeWarehouse)
        const secret = new Secret()
        secret.setClientEncrypted(await encryptPassword(connectionProps.snowflakeKey, getState().env.variables.AES_KEY, getState().env.variables.AES_IV))
        connection.setSnowflakeKey(secret)
      } else if (connectionType === ConnectionType.CONNECTION_TYPE_WHEROBOTS) {
        connection.setConnectionName(connectionProps.connectionName || 'Wherobots')
        connection.setWherobotsHost(connectionProps.wherobotsHost)
        connection.setWherobotsRegion(connectionProps.wherobotsRegion)
        connection.setWherobotsRuntime(connectionProps.wherobotsRuntime)
        const secret = new Secret()
        secret.setClientEncrypted(await encryptPassword(connectionProps.wherobotsKey, getState().env.variables.AES_KEY, getState().env.variables.AES_IV))
        connection.setWherobotsKey(secret)
      } else if (connectionProps.newBigqueryKey) { // bigquery service account key
        const { connectionName, cloudStorageBucket, newBigqueryKey } = connectionProps
        connection.setConnectionName(connectionName || 'BigQuery')
        connection.setCloudStorageBucket(cloudStorageBucket)
        const secret = new Secret()
        const { env: { variables: { AES_IV, AES_KEY } } } = getState()
        secret.setClientEncrypted(await encryptPassword(newBigqueryKey, AES_KEY, AES_IV))
        connection.setBigqueryKey(secret)
      } else {
        connection.setConnectionName(connectionProps.connectionName || 'BigQuery')
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
      if (connectionType === ConnectionType.CONNECTION_TYPE_SNOWFLAKE) {
        connection.setConnectionName(connectionProps.connectionName)
        connection.setSnowflakeAccountId(connectionProps.snowflakeAccountId)
        connection.setSnowflakeUsername(connectionProps.snowflakeUsername)
        connection.setSnowflakeWarehouse(connectionProps.snowflakeWarehouse)
        if (prevConnection?.snowflakeKey !== connectionProps.snowflakeKey) {
          // update secret only if it was changed, otherwise it's just a placeholder
          const secret = new Secret()
          secret.setClientEncrypted(await encryptPassword(connectionProps.snowflakeKey, getState().env.variables.AES_KEY, getState().env.variables.AES_IV))
          connection.setSnowflakeKey(secret)
        }
      } else if (prevConnection.bigqueryKey) { // bigquery service account key
        connection.setConnectionName(connectionProps.connectionName)
        connection.setCloudStorageBucket(connectionProps.cloudStorageBucket)
        if (connectionProps.newBigqueryKey) {
          // update key only if it was changed, otherwise it's just a placeholder
          const secret = new Secret()
          const { env: { variables: { AES_IV, AES_KEY } } } = getState()
          secret.setClientEncrypted(await encryptPassword(connectionProps.newBigqueryKey, AES_KEY, AES_IV))
          connection.setBigqueryKey(secret)
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

export function wherobotsConnectionHintError (err) {
  return { type: wherobotsConnectionHintError.name, error: err }
}

export function wherobotsConnectionHintResponse (hint) {
  const regions = hint?.regions?.hint?.filter((r) => r.enabled).map((r) => ({ value: r.regionName, label: r.regionName }))
  const runtimes = hint?.runtimes?.hint?.filter((r) => r.enabled).map((r) => ({ value: r.id, label: r.id }))
  return { type: wherobotsConnectionHintResponse.name, runtimes, regions }
}

export function getWherobotsConnectionHint (wherobotsHost, wherobotsKey) {
  return async (dispatch, getState) => {
    dispatch({ type: getWherobotsConnectionHint.name })
    const { env: { variables: { AES_IV, AES_KEY } } } = getState()
    const request = new GetWherobotsConnectionHintRequest()
    request.setWherobotsHost(wherobotsHost)
    const secret = new Secret()
    secret.setClientEncrypted(await encryptPassword(wherobotsKey, AES_KEY, AES_IV))
    request.setWherobotsKey(secret)
    const res = await new Promise((resolve) => {
      dispatch(grpcCall(Dekart.GetWherobotsConnectionHint, request, resolve, (err) => {
        dispatch(wherobotsConnectionHintError(err))
        if (err.code !== 13) {
          return err
        }
      }))
    })
    dispatch(wherobotsConnectionHintResponse(JSON.parse(res.hintJson)))
  }
}

export function testConnection (connectionType, values) {
  return async (dispatch, getState) => {
    dispatch({ type: testConnection.name })
    const { env: { variables: { AES_IV, AES_KEY } } } = getState()
    const request = new TestConnectionRequest()
    const connection = new Connection()
    connection.setConnectionType(connectionType)
    if (connectionType === ConnectionType.CONNECTION_TYPE_SNOWFLAKE) {
      const { connectionName, snowflakeAccountId, snowflakeUsername, snowflakeWarehouse, snowflakeKey } = values
      connection.setConnectionName(connectionName)
      connection.setSnowflakeAccountId(snowflakeAccountId)
      connection.setSnowflakeUsername(snowflakeUsername)
      connection.setSnowflakeWarehouse(snowflakeWarehouse)
      const secret = new Secret()
      secret.setClientEncrypted(await encryptPassword(snowflakeKey, AES_KEY, AES_IV))
      connection.setSnowflakeKey(secret)
    } else if (connectionType === ConnectionType.CONNECTION_TYPE_WHEROBOTS) {
      const { connectionName, wherobotsKey, wherobotsHost, wherobotsRegion, wherobotsRuntime } = values
      connection.setConnectionName(connectionName)
      connection.setWherobotsHost(wherobotsHost)
      connection.setWherobotsRegion(wherobotsRegion)
      connection.setWherobotsRuntime(wherobotsRuntime)
      const secret = new Secret()
      secret.setClientEncrypted(await encryptPassword(wherobotsKey, AES_KEY, AES_IV))
      connection.setWherobotsKey(secret)
    } else if (values.newBigqueryKey) { // bigquery service account key
      const { connectionName, cloudStorageBucket, newBigqueryKey } = values
      connection.setConnectionName(connectionName)
      connection.setCloudStorageBucket(cloudStorageBucket)
      const secret = new Secret()
      secret.setClientEncrypted(await encryptPassword(newBigqueryKey, AES_KEY, AES_IV))
      connection.setBigqueryKey(secret)
    } else { // bigquery
      const { connectionName, bigqueryProjectId, cloudStorageBucket } = values
      connection.setConnectionName(connectionName)
      connection.setBigqueryProjectId(bigqueryProjectId)
      connection.setCloudStorageBucket(cloudStorageBucket)
    }

    request.setConnection(connection)

    const res = await new Promise((resolve) => {
      dispatch(grpcCall(Dekart.TestConnection, request, resolve, (err) => err, 1))
    })

    dispatch(testConnectionResponse(res))
  }
}
