import { grpc } from '@improbable-eng/grpc-web'
import { CreateReportRequest, ReportStreamRequest, Report, CreateQueryRequest, Query, UpdateQueryRequest } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'

const { REACT_APP_API_HOST: host } = process.env
// const client = new DekartPromiseClient(REACT_APP_API_HOST)

function unary (method, request) {
  return new Promise((resolve, reject) => {
    grpc.unary(method, {
      host,
      request,
      onEnd: response => {
        if (response.status) {
          reject(new Error(response.statusMessage))
          return
        }
        resolve(response.message.toObject())
      },
      debug: true
    })
  })
}

export function createReport () {
  const request = new CreateReportRequest()
  return unary(Dekart.CreateReport, request)
}

export function createQuery (reportId) {
  const request = new CreateQueryRequest()
  const query = new Query()
  query.setReportId(reportId)
  request.setQuery(query)
  return unary(Dekart.CreateQuery, request)
}

export function updateQuery (queryId, queryText) {
  console.log('updateQuery', { queryId, queryText })
  const request = new UpdateQueryRequest()
  const query = new Query()
  query.setId(queryId)
  query.setQueryText(queryText)
  request.setQuery(query)
  return unary(Dekart.UpdateQuery, request)
}

export function getReportStream (reportId, onMessage) {
  const report = new Report()
  report.setId(reportId)
  const request = new ReportStreamRequest()
  request.setReport(report)
  let { cancel } = grpc.invoke(Dekart.GetReportStream, {
    host,
    request,
    // debug: true,
    onMessage: (message) => {
      console.log('onMessage', message.toObject())
      onMessage(message.toObject())
    },
    onEnd: (code, message) => {
      if (code === 0) {
        cancel = getReportStream(reportId, onMessage)
      } else {
        console.error('onEnd', code)
      }
    }
  })
  return () => cancel()
}
