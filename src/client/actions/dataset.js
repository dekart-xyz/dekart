import { CreateDatasetRequest, RemoveDatasetRequest } from "../../proto/dekart_pb"
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

export function removeDataset(datasetId) {
    return async (dispatch, getState) => {
        const { datasets, activeDataset } = getState()
        if (activeDataset.id === datasetId) {
            // removed active query
            const datasetsLeft = datasets.filter(q => q.id !== datasetId)
            if (datasetsLeft.length === 0) {
                dispatch(error(new Error('Cannot remove last dataset')))
                return
            }
            dispatch(setActiveDataset(datasetsLeft.id))
        }
        dispatch({ type: removeDataset.name, datasetId })

        const request = new RemoveDatasetRequest()
        request.setDatasetId(datasetId)
        try {
            await unary(Dekart.RemoveDataset, request)
            dispatch(success('Dataset removed'))
        } catch (err) {
            dispatch(error(err))
        }
    }
}
