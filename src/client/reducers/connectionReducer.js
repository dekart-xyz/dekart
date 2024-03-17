import { combineReducers } from 'redux'
import { closeConnectionDialog, connectionChanged, connectionCreated, connectionListUpdate, connectionSaved, editConnection, newConnection, saveConnection, testConnection, testConnectionResponse } from '../actions/connection'
import { userStreamUpdate } from '../actions/user'

function dialog (state = {
  visible: false,
  loading: true,
  id: null
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
        visible: true,
        loading: false
      }
    case newConnection.name:
      return {
        ...state,
        visible: true,
        id: null,
        loading: true
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
    case userStreamUpdate.name:
      if (action.userStream.isPlayground) {
        return false // user switched to playground, no longer user defined connection
      }
      return state
    default:
      return state
  }
}

export default combineReducers({
  dialog,
  test,
  list,
  userDefined,
  listLoaded
})
