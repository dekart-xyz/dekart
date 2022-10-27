import { CreateFileRequest } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { unary } from '../lib/grpc'
import { error } from './message'

export function createFile (datasetId) {
  return (dispatch) => {
    dispatch({ type: createFile.name })
    const request = new CreateFileRequest()
    request.setDatasetId(datasetId)
    unary(Dekart.CreateFile, request).catch(err => dispatch(error(err)))
  }
}
