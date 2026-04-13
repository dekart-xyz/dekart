import { CreateFileRequest } from 'dekart-proto/dekart_pb'
import { Dekart } from 'dekart-proto/dekart_pb_service'
import { grpcCall } from './grpc'
import { track } from '../lib/tracking'
import { inferMimeFromName } from '../lib/mime'
import { runFileUploadSession } from '../lib/fileUpload'

export function uploadFileStart (fileId, file) {
  return {
    type: uploadFileStart.name,
    fileId,
    file
  }
}

export function uploadFilePhase (fileId, phase, payload = {}) {
  return {
    type: uploadFilePhase.name,
    fileId,
    phase,
    payload
  }
}

export function uploadFileProgress (fileId, loaded, total, partNumber, partsTotal) {
  return {
    type: uploadFileProgress.name,
    fileId,
    loaded,
    total,
    partNumber,
    partsTotal
  }
}

export function uploadFileError (fileId, error) {
  return {
    type: uploadFileError.name,
    fileId,
    error
  }
}

export function uploadFileDone (fileId, result) {
  return {
    type: uploadFileDone.name,
    fileId,
    result
  }
}

export function uploadFileReset (fileId) {
  return {
    type: uploadFileReset.name,
    fileId
  }
}

export function uploadFile (fileId, file) {
  return async (dispatch, getState) => {
    dispatch(uploadFileStart(fileId, file))
    dispatch(uploadFilePhase(fileId, 'starting'))
    track('FileUploadStarted', { fileId, fileSize: file.size })
    const { token } = getState()
    const normalizedFile = file.type
      ? file
      : new window.File([file], file.name, {
        type: inferMimeFromName(file.name) || 'application/octet-stream'
      })
    try {
      await runFileUploadSession({
        fileId,
        file: normalizedFile,
        token,
        dispatch,
        actions: {
          uploadFilePhase,
          uploadFileProgress,
          uploadFileDone
        },
        track
      })
      track('FileUploadCompleted', { fileId })
    } catch (error) {
      dispatch(uploadFileError(fileId, error?.message || 'Upload failed'))
      track('FileUploadFailed', { fileId, message: error?.message || 'Upload failed' })
    }
  }
}

export function createFile (datasetId, connectionId) {
  return (dispatch) => {
    dispatch({ type: createFile.name })
    const request = new CreateFileRequest()
    request.setDatasetId(datasetId)
    request.setConnectionId(connectionId)
    dispatch(grpcCall(Dekart.CreateFile, request))
    track('CreateFile')
  }
}
