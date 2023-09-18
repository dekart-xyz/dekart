import { combineReducers } from 'redux'
import { closeConnectionDialog, connectionChanged, connectionCreated, editSource, newConnection, saveConnection, sourceListUpdate, sourceSaved, testConnection, testConnectionResponse } from '../actions/connection'

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
    case editSource.name:
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
    case sourceSaved.name:
      return {
        ...state,
        loading: false,
        visible: false
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
    case sourceListUpdate.name:
      return action.sourcesList
    default:
      return state
  }
}

export default combineReducers({
  dialog,
  test,
  list
})

// export function connectionSettings (state = {
//   visible: false,
//   tested: false,
//   testing: false,
//   testSuccess: false,
//   testError: ''
// }, action) {
//   switch (action.type) {
//     case newConnection.name:
//       return {
//         ...state,
//         visible: true
//       }
//     case testConnection.name:
//       return {
//         ...state,
//         testing: true,
//         testSuccess: false,
//         testError: ''
//       }
//     case testConnectionResponse.name:
//       return {
//         ...state,
//         tested: true,
//         testing: false,
//         testSuccess: action.success,
//         testError: action.error
//       }
//     case connectionChanged.name:
//       return {
//         ...state,
//         tested: false,
//         testSuccess: false,
//         testError: ''
//       }
//     default:
//       return state
//   }
// }
