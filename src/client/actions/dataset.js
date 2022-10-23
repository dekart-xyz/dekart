import { CreateDatasetRequest } from "../../proto/dekart_pb"
import { Dekart } from '../../proto/dekart_pb_service'
import { unary } from '../lib/grpc'
import { error, success } from './message'

export function createDataset(reportId) {
    return (dispatch) => {
        dispatch({ type: createDataset.name })
        const request = new CreateDatasetRequest()
        request.setReportId(reportId)
        unary(Dekart.CreateDataset, request).catch(err => dispatch(error(err)))
    }
}

export function setActiveDataset(datasetId) {
    return (dispatch, getState) => {
        const { datasets } = getState()
        const dataset = datasets.find(d => d.id === datasetId) || datasets[0]
        if (dataset) {
            dispatch({ type: setActiveDataset.name, dataset })
        }
    }
}
