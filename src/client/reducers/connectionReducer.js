import { combineReducers } from 'redux'
import { closeConnectionDialog, connectionChanged, connectionCreated, connectionListUpdate, connectionSaved, editConnection, newConnection, projectListUpdate, saveConnection, testConnection, testConnectionResponse } from '../actions/connection'
import { setEnv } from '../actions/env'

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

// userDefined when connection is not configured in Dekart via env variables
function userDefined (state = false, action) {
  switch (action.type) {
    case setEnv.name: {
      const { BIGQUERY_PROJECT_ID, CLOUD_STORAGE_BUCKET, DATASOURCE } = action.variables
      return (BIGQUERY_PROJECT_ID === '' && DATASOURCE === 'BQ') || (CLOUD_STORAGE_BUCKET === '' && DATASOURCE !== 'SNOWFLAKE')
    }
    default:
      return state
  }
}

function projects (state = [], action) {
  switch (action.type) {
    case projectListUpdate.name:
      return action.projectsList
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
  projects
})
