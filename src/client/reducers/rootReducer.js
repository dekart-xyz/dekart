import { combineReducers } from 'redux'
import { ActionTypes as KeplerActionTypes } from '@kepler.gl/actions'
import { setUserMapboxAccessTokenUpdater } from '@kepler.gl/reducers/dist/ui-state-updaters'
import { openReport, reportUpdate } from '../actions/report'
import { numRunningQueries, queries, queryJobs, queryParams, queryStatus } from './queryReducer'
import { setUsage } from '../actions/usage'
import { setEnv } from '../actions/env'
import { newRelease } from '../actions/version'
import { uploadFile, uploadFileProgress, uploadFileStateChange } from '../actions/file'
import keplerGlReducer from '@kepler.gl/reducers'
import stream from './streamReducer'
import token from './tokenReducer'
import connection from './connectionReducer'
import user from './userReducer'
import workspace from './workspaceReducer'
import httpError from './httpErrorReducer'
import dataset from './datasetReducer'
import storage from './storageReducer'
import { setRedirectState } from '../actions/redirect'
import sessionStorage from './sessionStorageReducer'
import readme from './readmeReducer'
import analytics from './analyticsReducer'
import { upgradeModal } from './upgradeModalReducer'
import { report, reportDirectAccessEmails, reportsList, reportStatus } from './reportReducer'

const customKeplerGlReducer = keplerGlReducer.initialState({
  uiState: {
    currentModal: null,
    activeSidePanel: null
  }
})

function keplerGl (state, action) {
  const newState = customKeplerGlReducer(state, action)
  switch (action.type) {
    case KeplerActionTypes.LOAD_FILES_ERR:
      return state // suppress file loading error
    case KeplerActionTypes.REGISTER_ENTRY:
      // set mapbox token for map export
      newState.kepler.uiState = setUserMapboxAccessTokenUpdater(newState.kepler.uiState, {
        payload: newState.kepler.mapStyle.mapboxApiAccessToken
      })
      return newState
    default:
      return newState
  }
}

function files (state = [], action) {
  switch (action.type) {
    case openReport.name:
      return []
    case reportUpdate.name:
      return action.filesList
    default:
      return state
  }
}

const defaultUsage = { loaded: false, stats: null }
function usage (state = defaultUsage, action) {
  switch (action.type) {
    case setUsage.name:
      return {
        loaded: true,
        stats: action.stats
      }
    default:
      return state
  }
}

const defaultEnv = { loaded: false, variables: {}, authEnabled: null, authType: 'UNSPECIFIED' }
function env (state = defaultEnv, action) {
  switch (action.type) {
    case setRedirectState.name:
      return {
        ...state,
        loaded: false // reset when user auth details like token change
      }
    case setEnv.name:
      return {
        loaded: true,
        variables: action.variables,
        authEnabled: Boolean(action.variables.AUTH_ENABLED),
        secretsEnabled: Boolean(action.variables.SECRETS_ENABLED),
        uxConfig: JSON.parse(action.variables.CLOUD_UX_CONFIG_JSON || '{}'),
        isCloud: Boolean(action.variables.DEKART_CLOUD)
      }
    default:
      return state
  }
}

function release (state = null, action) {
  switch (action.type) {
    case newRelease.name:
      return action.release
    default:
      return state
  }
}

function fileUploadStatus (state = {}, action) {
  switch (action.type) {
    case uploadFile.name:
      return {
        ...state,
        [action.fileId]: {
          readyState: 0,
          loaded: 0,
          total: action.file.size,
          status: 0
        }
      }
    case uploadFileStateChange.name:
      return {
        ...state,
        [action.fileId]: {
          ...state[action.fileId],
          readyState: action.readyState,
          status: action.status
        }
      }
    case uploadFileProgress.name:
      return {
        ...state,
        [action.fileId]: {
          ...state[action.fileId],
          loaded: action.loaded
        }
      }
    default:
      return state
  }
}

export default combineReducers({
  keplerGl,
  report,
  reportStatus,
  reportsList,
  reportDirectAccessEmails,
  env,
  httpError,
  release,
  files,
  fileUploadStatus,
  usage,
  connection,
  token,
  stream,
  user,
  workspace,
  dataset,
  storage,
  queries,
  queryStatus,
  queryParams,
  queryJobs,
  numRunningQueries,
  sessionStorage,
  readme,
  analytics,
  upgradeModal
})
