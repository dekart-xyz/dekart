import { combineReducers } from 'redux'
import { closeConnectionDialog, connectionChanged, connectionCreated, connectionListUpdate, connectionSaved, editConnection, getWherobotsConnectionHint, newConnection, newConnectionScreen, projectListUpdate, reOpenDialog, saveConnection, testConnection, testConnectionResponse, wherobotsConnectionHintError, wherobotsConnectionHintResponse } from '../actions/connection'
import { setEnv } from '../actions/env'
import { sessionStorageInit, updateSessionStorage } from '../actions/sessionStorage'

function dialog (state = {
  visible: false,
  loading: true,
  id: null,
  connectionType: null,
  bigqueryKey: false
}, action) {
  switch (action.type) {
    case closeConnectionDialog.name:
      return {
        ...state,
        visible: false
      }
    case editConnection.name:
      return {
        ...state,
        id: action.id,
        connectionType: action.connectionType,
        visible: true,
        loading: false,
        bigqueryKey: action.bigqueryKey
      }
    case newConnection.name:
      return {
        ...state,
        visible: true,
        id: null,
        loading: false,
        connectionType: action.connectionType,
        bigqueryKey: action.bigqueryKey
      }
    case connectionCreated.name:
      return {
        ...state,
        id: action.id,
        loading: false
      }
    case saveConnection.name:
      return {
        ...state,
        loading: true
      }
    case connectionSaved.name:
      return {
        ...state,
        loading: false,
        visible: false,
        id: null
      }
    default:
      return state
  }
}

function test (state = {
  tested: false,
  testing: false,
  success: false,
  error: ''
}, action) {
  switch (action.type) {
    case testConnection.name:
      return {
        ...state,
        testing: true,
        success: false,
        error: ''
      }
    case testConnectionResponse.name:
      return {
        ...state,
        tested: true,
        testing: false,
        success: action.success,
        error: action.error
      }
    case connectionChanged.name:
      return {
        ...state,
        tested: false,
        success: false,
        error: ''
      }
    default:
      return state
  }
}

function list (state = [], action) {
  switch (action.type) {
    case connectionListUpdate.name:
      return action.connectionsList
    default:
      return state
  }
}

function listLoaded (state = false, action) {
  switch (action.type) {
    case connectionListUpdate.name:
      return true
    default:
      return state
  }
}

// can user define their own connections
function userDefined (state = true, action) {
  switch (action.type) {
    case setEnv.name: {
      return Boolean(action.variables.USER_DEFINED_CONNECTION)
    }
    default:
      return state
  }
}

function wherobotsHint (state = {
  loading: false,
  regions: [],
  runtimes: []
}, action) {
  switch (action.type) {
    case wherobotsConnectionHintResponse.name:
      return {
        loading: false,
        regions: action.regions || [],
        runtimes: action.runtimes || []
      }
    case getWherobotsConnectionHint.name:
      return {
        ...state,
        loading: true
      }
    case wherobotsConnectionHintError.name:
      return {
        ...state,
        loading: false
      }
    default:
      return state
  }
}

function projects (state = null, action) {
  switch (action.type) {
    case projectListUpdate.name:
      return action.projectsList
    default:
      return state
  }
}

function screen (state = false, action) {
  switch (action.type) {
    case newConnectionScreen.name:
      return action.show
    case newConnection.name:
      return false
    default:
      return state
  }
}

function lastOpenedDialog (state = null, action) {
  switch (action.type) {
    case sessionStorageInit.name:
      return action.current.lastOpenedDialog || null
    case reOpenDialog.name:
      return null // only open dialog once
    default:
      return state
  }
}

function redirectWhenSaveConnection (state = null, action) {
  switch (action.type) {
    case updateSessionStorage.name:
    case sessionStorageInit.name:
      return action.current.redirectWhenSaveConnection || null // for backward compatibility
    default:
      return state
  }
}

export default combineReducers({
  dialog,
  test,
  list,
  userDefined,
  listLoaded,
  projects,
  screen,
  lastOpenedDialog,
  redirectWhenSaveConnection,
  wherobotsHint
})
