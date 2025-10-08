import { grpc } from '@improbable-eng/grpc-web'
import { StreamOptions } from 'dekart-proto/dekart_pb'
import { setError, setStreamError } from './message'
import { getReportIdFromUrl } from '../lib/getReportIdFromUrl'
import { UNKNOWN_EMAIL } from '../lib/constants'

const { VITE_API_HOST } = import.meta.env
const host = VITE_API_HOST || ''

export function grpcCall (method, request, resolve = () => {}, reject = (err) => err, maxRetries = 0) {
  return async function (dispatch, getState) {
    const { token, user: { isPlayground, claimEmailCookie, loginHint } } = getState()
    const headers = new window.Headers()
    if (token) {
      headers.append('Authorization', `Bearer ${token.access_token}`)
    }
    if (isPlayground) {
      headers.append('X-Dekart-Playground', 'true')
    }
    if (claimEmailCookie) {
      headers.append('X-Dekart-Claim-Email', claimEmailCookie)
    }
    if (getReportIdFromUrl()) {
      headers.append('X-Dekart-Report-Id', getReportIdFromUrl())
    }
    if (loginHint && loginHint !== UNKNOWN_EMAIL) {
      headers.append('X-Dekart-Logged-In', 'true')
    }

    let attempts = 0

    while (attempts <= maxRetries) {
      try {
        const response = await unary(method, request, headers)
        resolve(response)
        return
      } catch (err) {
        attempts++
        const passErr = reject(err)
        if (attempts > maxRetries) {
          if (passErr instanceof GrpcError) {
            dispatch(setStreamError(passErr.code, passErr.message))
          } else if (passErr) {
            dispatch(setError(passErr))
          }
          return
        }
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

  setInvokeRequest (req) {
    if (this.canceled) {
      // cancel the request if it was canceled before it was set
      req.close()
    }
    this.cancelInvoke = req.close
  }

  cancel () {
    if (this.cancelInvoke && !this.canceled) {
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
  return (dispatch, getState) => {
    const { token, user: { isPlayground, claimEmailCookie, loginHint } } = getState()
    const headers = new window.Headers()
    if (token) {
      headers.append('Authorization', `Bearer ${token.access_token}`)
    }
    if (isPlayground) {
      headers.append('X-Dekart-Playground', 'true')
    }
    if (claimEmailCookie) {
      headers.append('X-Dekart-Claim-Email', claimEmailCookie)
    }
    if (getReportIdFromUrl()) {
      headers.append('X-Dekart-Report-Id', getReportIdFromUrl())
    }
    if (loginHint && loginHint !== UNKNOWN_EMAIL) {
      headers.append('X-Dekart-Logged-In', 'true')
    }
    const onMessage = (message) => {
      const err = cb(message, null)
      if (err) {
        if (err instanceof GrpcError) {
          dispatch(setStreamError(err.code, err.message))
        } else {
          dispatch(setError(err))
        }
      }
    }
    const onError = (code, message) => {
      const err = cb(null, new GrpcError(message, code))
      if (err instanceof GrpcError) {
        dispatch(setStreamError(err.code, err.message))
      } else {
        dispatch(setError(err))
      }
    }
    let cancelable = getStream(
      endpoint,
      request,
      onMessage,
      onError,
      headers
    )
    dispatch({ type: grpcStream.name, endpoint, cancelable })

    const cancelOnVisibilityChange = () => {
      if (cancelable && cancelable.canceled) {
        return
      }
      if (document.hidden) {
        // close streams when tab is hidden
        // prevents blocking connections for multiple tabs
        document.removeEventListener('visibilitychange', cancelOnVisibilityChange)
        dispatch(grpcStreamCancel(endpoint))
        document.addEventListener('visibilitychange', resumeOnVisibilityChange)
      }
    }

    const resumeOnVisibilityChange = () => {
      if (!document.hidden) {
        // resume streams when tab is visible
        document.removeEventListener('visibilitychange', resumeOnVisibilityChange)
        cancelable = getStream(
          endpoint,
          request,
          onMessage,
          onError,
          headers
        )
        dispatch({ type: grpcStream.name, endpoint, cancelable })
        document.addEventListener('visibilitychange', cancelOnVisibilityChange)
      }
    }

    document.addEventListener('visibilitychange', cancelOnVisibilityChange)
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
      } else if (
        (code === 2) &&
        retryCount <= 4
      ) {
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
        onError(code, message)
      }
    }
  }))
  return cancelable
}
