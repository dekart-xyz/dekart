import {
  uploadFileDone,
  uploadFileError,
  uploadFilePhase,
  uploadFileProgress,
  uploadFileReset,
  uploadFileStart
} from '../actions/file'

// fileUploadStatus stores transient session upload UI state per file id.
export default function fileUploadStatus (state = {}, action) {
  switch (action.type) {
    case uploadFileStart.name:
      return {
        ...state,
        [action.fileId]: {
          phase: 'starting',
          loaded: 0,
          total: action.file.size,
          partNumber: 0,
          partsTotal: 0,
          uploadSessionId: null,
          error: null
        }
      }
    case uploadFilePhase.name:
      return {
        ...state,
        [action.fileId]: {
          ...state[action.fileId],
          phase: action.phase,
          ...action.payload
        }
      }
    case uploadFileProgress.name:
      return {
        ...state,
        [action.fileId]: {
          ...state[action.fileId],
          phase: 'uploading',
          loaded: action.loaded,
          total: action.total,
          partNumber: action.partNumber,
          partsTotal: action.partsTotal
        }
      }
    case uploadFileDone.name:
      return {
        ...state,
        [action.fileId]: {
          ...state[action.fileId],
          phase: 'done',
          loaded: state[action.fileId]?.total || state[action.fileId]?.loaded || 0,
          error: null,
          result: action.result
        }
      }
    case uploadFileError.name:
      return {
        ...state,
        [action.fileId]: {
          ...state[action.fileId],
          phase: 'error',
          error: action.error
        }
      }
    case uploadFileReset.name: {
      const nextState = { ...state }
      delete nextState[action.fileId]
      return nextState
    }
    default:
      return state
  }
}
