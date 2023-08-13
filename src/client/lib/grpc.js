import { grpc } from '@improbable-eng/grpc-web'
import { CreateReportRequest, ReportStreamRequest, Report, StreamOptions } from '../../proto/dekart_pb'
import { Dekart } from '../../proto/dekart_pb_service'
import { error, streamError } from '../actions/message'

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

class GrpcError extends Error {
  constructor (message, code) {
    super(message)
    this.code = code
    this.name = 'GrpcError'
  }
}

export function stream (endpoint, request, cb) {
  return async (dispatch, getState) => {
    const { token } = getState()
    const headers = new window.Headers()
    if (token) {
      headers.append('Authorization', `Bearer ${token.access_token}`)
    }
    const cancelable = getStream(
      endpoint,
      request,
      (mes) => {
        const err = cb(mes, null)
        if (err) {
          if (err instanceof GrpcError) {
            // TODO: fix naming of streamError
            dispatch(streamError(err.code, err.message))
          } else {
            dispatch(error(err))
          }
        }
      },
      (code, message) => {
        const err = cb(null, new GrpcError(message, code))
        if (err instanceof GrpcError) {
          dispatch(streamError(err.code, err.message))
        } else {
          dispatch(error(err))
        }
      },
      headers
    )
    dispatch({ type: stream.name, cancelable })
  }
}

// getStream is a wrapper around grpc.invoke that handles reconnecting
export function getStream (endpoint, request, onMessage, onError, metadata = {}, cancelable = new CancelableRequest(), sequence = 0, retryCount = 0) {
  const streamOptions = new StreamOptions()
  let currentSequence = sequence
  streamOptions.setSequence(currentSequence)
  request.setStreamOptions(streamOptions)
  cancelable.setInvokeRequest(grpc.invoke(endpoint, {
    host,
    request,
    metadata,
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
        getStream(endpoint, request, onMessage, onError, metadata, cancelable, currentSequence)
      } else if (code === 2 && retryCount <= 4) {
        if (window.document.hidden) {
          const onVisibilityChange = () => {
            window.document.removeEventListener('visibilitychange', onVisibilityChange, false)
            onEnd(code, message)
          }
          window.document.addEventListener('visibilitychange', onVisibilityChange, false)
        } else {
          retryCount++
          setTimeout(() => getStream(endpoint, request, onMessage, onError, metadata, cancelable, currentSequence, retryCount + 1), 100 * Math.pow(2, retryCount))
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
