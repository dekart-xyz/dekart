import { GetSnapshotsRequest } from 'dekart-proto/dekart_pb'
import { Dekart } from 'dekart-proto/dekart_pb_service'
import { grpcCall } from './grpc'

export function setSnapshotsData (data) {
  return { type: setSnapshotsData.name, data }
}

export function setSnapshotsLoading (loading) {
  return { type: setSnapshotsLoading.name, loading }
}

export function getSnapshots () {
  return async (dispatch, getState) => {
    dispatch({ type: getSnapshots.name })
    dispatch(setSnapshotsLoading(true))
    const req = new GetSnapshotsRequest()
    const reportId = getState().report.id
    if (!reportId) {
      dispatch(setSnapshotsLoading(false))
      return
    }
    req.setReportId(reportId)
    dispatch(grpcCall(Dekart.GetSnapshots, req, (res) => {
      dispatch(setSnapshotsData(res))
      dispatch(setSnapshotsLoading(false))
    }, () => {
      dispatch(setSnapshotsLoading(false))
    }))
  }
}


