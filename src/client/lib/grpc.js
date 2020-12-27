import { grpc } from '@improbable-eng/grpc-web'
import { CreateReportRequest, ReportStreamRequest, Report } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'

const { REACT_APP_API_HOST: host } = process.env
// const client = new DekartPromiseClient(REACT_APP_API_HOST)

export function unary (method, request) {
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

// export function createQuery (reportId) {
//   const request = new CreateQueryRequest()
//   const query = new Query()
//   query.setReportId(reportId)
//   request.setQuery(query)
//   return unary(Dekart.CreateQuery, request)
// }

class CancelableRequest {
  constructor () {
    this.canceled = false
    this.cancel = this.cancel.bind(this)
  }

  setInvokeRequest ({ cancel }) {
    if (this.canceled) {
      throw new Error('Request already canceled')
    }
    this.cancelInvoke = cancel
  }

  cancel () {
    if (this.cancelInvoke) {
      this.cancelInvoke()
    }
    this.canceled = true
  }
}

export function getReportStream (reportId, onMessage, onError, cancelable = new CancelableRequest()) {
  const report = new Report()
  report.setId(reportId)
  const request = new ReportStreamRequest()
  request.setReport(report)
  // let canceled = false
  cancelable.setInvokeRequest(grpc.invoke(Dekart.GetReportStream, {
    host,
    request,
    // debug: true,
    onMessage: (message) => {
      if (!cancelable.canceled) {
        onMessage(message.toObject())
      }
      // console.log('onMessage', message.toObject())
      // onMessage(message.toObject())
    },
    onEnd: (code, message) => {
      if (code === 0) {
        if (!cancelable.canceled) {
          getReportStream(reportId, onMessage, onError, cancelable)
        }
      } else {
        cancelable.cancel()
        onError(code)
        // canceled = true
        // console.error('onEnd', code)
      }
    }
  }))
  return cancelable
}
