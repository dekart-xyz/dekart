import { combineReducers } from 'redux'
import { userStreamUpdate } from '../actions/user'
import { closeConnectionDialog, connectionChanged, connectionCreated, connectionListUpdate, connectionSaved, editConnection, newConnection, newConnectionScreen, projectListUpdate, reOpenDialog, saveConnection, testConnection, testConnectionResponse } from '../actions/connection'
import { sessionStorageInit } from '../actions/sessionStorage'

function dialog (state = {
  visible: false,
  loading: true,
  id: null,
  connectionType: null
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
        loading: false
      }
    case newConnection.name:
      return {
        ...state,
        visible: true,
        id: null,
        loading: false,
        connectionType: action.connectionType
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

// in cloud it's always user defined, except for playground
function userDefined (state = true, action) {
  switch (action.type) {
    case sessionStorageInit.name:
      // in playground it's not user defined
      if (action.current.isPlayground) {
        return false
      }
      return state
    case userStreamUpdate.name:
      if (
        !action.userStream.planType // user is not yet in workspace
      ) {
        return false
      }
      return state
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

export default combineReducers({
  dialog,
  test,
  list,
  userDefined,
  listLoaded,
  projects,
  screen,
  lastOpenedDialog
})
