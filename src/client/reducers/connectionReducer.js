import { combineReducers } from 'redux'
import { connectionChanged, connectionCreated, newConnection, testConnection, testConnectionResponse } from '../actions/connection'
import { reportUpdate } from '../actions/report'

function dialog (state = {
  visible: false,
  id: null
}, action) {
  switch (action.type) {
    case newConnection.name:
      return {
        ...state,
        visible: true,
        id: null
      }
    case connectionCreated.name:
      return {
        ...state,
        id: action.id
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
    case reportUpdate.name:
      console.log('reportUpdate', action)
      return []
      // return [
      //   ...state,
      //   action.id
      // ]
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
