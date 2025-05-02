import { CreateFileRequest } from 'dekart-proto/dekart_pb'
import { Dekart } from 'dekart-proto/dekart_pb_service'
import { grpcCall } from './grpc'

export function uploadFileProgress (fileId, loaded, total) {
  return {
    type: uploadFileProgress.name,
    fileId,
    loaded,
    total
  }
}

export function uploadFileStateChange (fileId, readyState, status) {
  return {
    type: uploadFileStateChange.name,
    fileId,
    readyState,
    status
  }
}

export function uploadFile (fileId, file) {
  return async (dispatch, getState) => {
    dispatch({ type: uploadFile.name, fileId, file })
    const formData = new window.FormData()
    formData.append('file', file)

    const { VITE_API_HOST } = import.meta.env
    const host = VITE_API_HOST || ''
    const url = `${host}/api/v1/file/${fileId}.csv`

    const { token } = getState()

    const request = new window.XMLHttpRequest()

    request.upload.addEventListener('progress', (event) => {
      dispatch(uploadFileProgress(fileId, event.loaded, event.total))
    })
    request.addEventListener('readystatechange', (event) => {
      dispatch(uploadFileStateChange(fileId, request.readyState, request.status))
    })

    request.open('POST', url)

    if (token) {
      request.setRequestHeader('Authorization', `Bearer ${token.access_token}`)
    }

    request.timeout = 3600 * 1000 // 1 hour
    request.multipart = true
    request.send(formData)
  }
}

export function createFile (datasetId) {
  return (dispatch) => {
    dispatch({ type: createFile.name })
    const request = new CreateFileRequest()
    request.setDatasetId(datasetId)
    dispatch(grpcCall(Dekart.CreateFile, request))
  }
}
