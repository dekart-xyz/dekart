import { grpc } from '@improbable-eng/grpc-web'
import { CreateReportRequest, ReportStreamRequest, Report, StreamOptions } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'

const { REACT_APP_API_HOST } = process.env
const host = REACT_APP_API_HOST || ''

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

export function getStream (endpoint, request, onMessage, onError, cancelable = new CancelableRequest(), sequence = 0, retryCount = 0) {
  const streamOptions = new StreamOptions()
  let currentSequence = sequence
  streamOptions.setSequence(currentSequence)
  request.setStreamOptions(streamOptions)
  cancelable.setInvokeRequest(grpc.invoke(endpoint, {
    host,
    request,
    onMessage: (message) => {
      retryCount = 0
      if (!cancelable.canceled) {
        const messageObj = message.toObject()
        currentSequence = messageObj.streamOptions.sequence
        onMessage(messageObj)
      }
    },
    onEnd: function onEnd (code, message) {
      if (cancelable.canceled) {
        return
      }
      if (code === 0) {
        getStream(endpoint, request, onMessage, onError, cancelable, currentSequence)
      } else if (code === 2 && retryCount <= 4) {
        if (window.document.hidden) {
          const onVisibilityChange = () => {
            window.document.removeEventListener('visibilitychange', onVisibilityChange, false)
            onEnd(code, message)
          }
          window.document.addEventListener('visibilitychange', onVisibilityChange, false)
        } else {
          retryCount++
          setTimeout(() => getStream(endpoint, request, onMessage, onError, cancelable, currentSequence, retryCount + 1), 100 * Math.pow(2, retryCount))
        }
      } else {
        cancelable.cancel()
        // console.error('GRPC stream error', code, message)
        onError(code, message)
      }
    }
  }))
  return cancelable
}

export function getReportStream (reportId, onMessage, onError) {
  const report = new Report()
  report.setId(reportId)
  const request = new ReportStreamRequest()
  request.setReport(report)
  return getStream(Dekart.GetReportStream, request, onMessage, onError)
}
