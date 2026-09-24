import message from 'antd/es/message'
import PermanentError from '../PermanentError'
import StreamError from '../StreamError'
import MapConfigConflictMessage from '../MapConfigConflictMessage'
import { track } from '../lib/tracking'

const style = {}
const STREAM_ERROR_KEY = 'stream-error'
const MAP_CONFIG_CONFLICT_KEY = 'map-config-conflict'
const MAX_TRACKED_MESSAGE_LENGTH = 2000

message.config({ top: 40 })

export function downloading (dataset, controller) {
  return { type: downloading.name, dataset, controller }
}

export function warn (content, transitive = true) {
  track('WarnMessage', { transitive })
  if (!transitive) {
    message.warn({
      content,
      duration: 10000,
      style
    })
  } else {
    message.warn({
      content,
      style
    })
  }
  return { type: warn.name }
}
export function success (content) {
  track('SuccessMessage')
  message.success({
    content,
    style
  })
  return { type: success.name }
}

export function trialSuccess () {
  track('TrialSuccessMessage')
  message.success({
    content: 'Trial started! You now have full access',
    style
  })
  return { type: trialSuccess.name }
}

export function info (content, key = undefined) {
  track('InfoMessage')
  message.info({
    content,
    key,
    style
  })
  return { type: info.name }
}

export function showMapConfigConflictMessage () {
  message.info({
    key: MAP_CONFIG_CONFLICT_KEY,
    duration: 0,
    style,
    content: (
      <MapConfigConflictMessage
        onReload={() => window.location.reload()}
        onDismiss={() => message.destroy(MAP_CONFIG_CONFLICT_KEY)}
      />
    )
  })
  return { type: showMapConfigConflictMessage.name }
}

// trackedErrorProps caps tracked error text so events stay under Plausible and TrackEvent size limits.
function trackedErrorProps (errorMessage) {
  const text = String(errorMessage ?? '')
  return { message: text.slice(0, MAX_TRACKED_MESSAGE_LENGTH), message_length: text.length }
}

export function setError (err, transitive = true) {
  return (dispatch, getState) => {
    console.error(err)
    if ([401, 403].includes(err.status)) {
      dispatch(setHttpError(err.status, `${err.message}: ${err.errorDetails}`))
    } else {
      track('setError', { ...trackedErrorProps(err.message), report_id: getState().report?.id }) // System error
      if (transitive) {
        message.error({
          key: err.message,
          content: err.message,
          style
        })
      } else {
        message.error({
          key: err.message,
          content: (<PermanentError message={err.message} />),
          duration: 10000,
          style
        })
      }
    }
    return { type: setError.name }
  }
}

export function setHttpError (status, message = '') {
  if (status !== 401) {
    // 401 is normal part of auth flow, so we don't need to track it
    track('setHttpError', {
      status,
      message
    })
  }
  const sourceURL = window.location.href
  return { type: setHttpError.name, status, message, sourceURL }
}

// Helper to show error message with tracking
function showStreamError (errorCode, errorMsg, reportId) {
  track('setStreamError', {
    status: errorCode,
    ...trackedErrorProps(errorMsg),
    report_id: reportId
  })
  message.error({
    key: STREAM_ERROR_KEY,
    content: (<StreamError code={errorCode} message={errorMsg} />),
    duration: 10000,
    style
  })
}

export function setStreamError (code, msg) {
  return (dispatch, getState) => {
    const httpError = getState().httpError
    const serverErrorMessage = 'The server is currently unavailable.'
    dispatch({ type: setStreamError.name })
    console.error(code)

    // https://github.com/grpc/grpc/blob/master/doc/statuscodes.md
    switch (code) {
      case 1:
        track('RequestCancelled')
        dispatch(info('Request cancelled'))
        return
      case 2:
        if (httpError.status === 401) {
          // we already navigate off the page, so we don't need to show the error
          return
        }
        showStreamError(code, serverErrorMessage, getState().report?.id)
        return
      case 5:
        dispatch(setHttpError(404))
        return
      case 3:
        dispatch(setHttpError(400))
        return
      case 16:
        dispatch(setHttpError(401))
        return
      default:
        showStreamError(code, msg || serverErrorMessage, getState().report?.id)
    }
  }
}
