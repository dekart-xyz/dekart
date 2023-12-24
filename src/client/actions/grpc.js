import { grpc } from '@improbable-eng/grpc-web'
import { StreamOptions } from '../../proto/dekart_pb'
import { setError, setStreamError } from './message'

const { REACT_APP_API_HOST } = process.env
const host = REACT_APP_API_HOST || ''

export function grpcCall (method, request, resolve = () => {}, reject = (err) => err) {
  return async function (dispatch, getState) {
    const { token } = getState()
    const headers = new window.Headers()
    if (token) {
      headers.append('Authorization', `Bearer ${token.access_token}`)
    }
    try {
      const response = await unary(method, request, headers)
      resolve(response)
    } catch (err) {
      const passErr = reject(err)
      if (passErr instanceof GrpcError) {
        dispatch(setStreamError(passErr.code, passErr.message))
      } else if (passErr) {
        dispatch(setError(passErr))
      }
    }
  }
}

function unary (method, request, metadata = new window.Headers()) {
  return new Promise((resolve, reject) => {
    grpc.unary(method, {
      host,
      request,
      metadata,
      onEnd: response => {
        if (response.status) {
          reject(new GrpcError(response.statusMessage, response.status))
          return
        }
        resolve(response.message.toObject())
      },
      debug: true
    })
  })
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

export function grpcStream (endpoint, request, cb) {
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
            dispatch(setStreamError(err.code, err.message))
          } else {
            dispatch(setError(err))
          }
        }
      },
      (code, message) => {
        const err = cb(null, new GrpcError(message, code))
        if (err instanceof GrpcError) {
          dispatch(setStreamError(err.code, err.message))
        } else {
          dispatch(setError(err))
        }
      },
      headers
    )
    dispatch({ type: grpcStream.name, endpoint, cancelable })
  }
}

export function grpcStreamCancel (endpoint) {
  return (dispatch, getState) => {
    const { stream } = getState()
    const streamObj = stream[endpoint.methodName]
    if (streamObj) {
      streamObj.cancel()
      dispatch({ type: grpcStreamCancel.name, endpoint })
    }
  }
}

// getStream is a wrapper around grpc.invoke that handles reconnecting
function getStream (endpoint, request, onMessage, onError, metadata = {}, cancelable = new CancelableRequest(), sequence = 0, retryCount = 0) {
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
