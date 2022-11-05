import { CreateFileRequest } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { unary } from '../lib/grpc'
import { error } from './message'

export function uploadFileProgress (fileId, loaded, total) {
  return {
    type: uploadFileProgress.name,
    fileId,
    loaded,
    total
  }
}

export function uploadFileStateChange (fileId, readyState) {
  return {
    type: uploadFileStateChange.name,
    fileId,
    readyState
  }
}

export function uploadFile (fileId, file) {
  return async (dispatch) => {
    dispatch({ type: uploadFile.name, fileId, file })
    const formData = new window.FormData()
    console.log('file', file)
    formData.append('file', file)
    const { REACT_APP_API_HOST } = process.env
    const host = REACT_APP_API_HOST || ''
    const url = `${host}/api/v1/file/${fileId}.csv`
    const request = new window.XMLHttpRequest()
    request.upload.addEventListener('progress', (event) => {
      dispatch(uploadFileProgress(fileId, event.loaded, event.total))
    })
    // request.upload.addEventListener('load', (event) => {
    //   console.log('uploadFile load', event)
    // })
    // request.upload.addEventListener('error', (event) => {
    //   console.log('uploadFile error', event)
    // })
    // request.upload.addEventListener('abort', (event) => {
    //   console.log('uploadFile abort', event)
    // })
    // request.upload.addEventListener('loadend', (event) => {
    //   console.log('uploadFile loadend', event)
    // })
    request.addEventListener('readystatechange', (event) => {
      dispatch(uploadFileStateChange(fileId, request.readyState))
    })
    request.open('POST', url)
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
    unary(Dekart.CreateFile, request).catch(err => dispatch(error(err)))
  }
}
