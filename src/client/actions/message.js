import message from 'antd/es/message'
import PermanentError from '../PermanentError'
import StreamError from '../StreamError'

const style = {}

message.config({ top: 100 })

export function downloading (dataset) {
  return { type: downloading.name, dataset }
}

export function finishDownloading (dataset, gone = false) {
  return { type: finishDownloading.name, dataset, gone }
}

export function warn (content, transitive = true) {
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
  message.success({
    content,
    style
  })
  return { type: success.name }
}

export function info (content) {
  message.info({
    content,
    style
  })
  return { type: info.name }
}

export function setError (err, transitive = true) {
  return (dispatch) => {
    console.error(err)
    if ([401, 403].includes(err.status)) {
      dispatch(setHttpError(err.status, `${err.message}: ${err.errorDetails}`))
    } else if (transitive) {
      message.error({
        content: err.message,
        style
      })
    } else {
      message.error({
        content: (<PermanentError message={err.message} />),
        duration: 10000,
        style
      })
    }
    return { type: setError.name }
  }
}

export function setHttpError (status, message = '') {
  return { type: setHttpError.name, status, message }
}

export function setStreamError (code, msg) {
  return (dispatch) => {
    dispatch({ type: setStreamError.name })
    console.error(code)
    // https://github.com/grpc/grpc/blob/master/doc/statuscodes.md
    switch (code) {
      case 1:
        dispatch(info('Request cancelled'))
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
        message.error({
          content: (<StreamError code={code} message={msg} />),
          duration: 10000,
          style
        })
    }
  }
}
