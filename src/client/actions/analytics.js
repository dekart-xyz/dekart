import { GetReportAnalyticsRequest } from 'dekart-proto/dekart_pb'
import { Dekart } from 'dekart-proto/dekart_pb_service'
import { grpcCall } from './grpc'

export function setAnalyticsModalOpen (modalOpen) {
  return { type: setAnalyticsModalOpen.name, modalOpen }
}

export function setAnalyticsData (data) {
  return { type: setAnalyticsData.name, data }
}

export function getAnalyticsData () {
  return async (dispatch, getState) => {
    dispatch({ type: getAnalyticsData.name })
    const req = new GetReportAnalyticsRequest()
    const reportId = getState().report.id
    req.setReportId(reportId)
    dispatch(grpcCall(Dekart.GetReportAnalytics, req, (res) => {
      dispatch({ type: setAnalyticsData.name, data: res.analytics })
    }))
  }
}
