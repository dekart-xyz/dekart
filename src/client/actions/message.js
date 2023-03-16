import message from 'antd/es/message'
import PermanentError from '../PermanentError'
import StreamError from '../StreamError'

const style = { /* marginTop: 0 */ }

message.config({ top: 40 })

export function downloading (dataset) {
  return { type: downloading.name, dataset }
}

export function finishDownloading (dataset) {
  return { type: finishDownloading.name, dataset }
}

export function success (content) {
  message.success({
    content,
    style
  })
  return { type: success.name }
}

export function error (err, transitive = true) {
  console.error(err)
  if (transitive) {
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
  return { type: error.name }
}

export function httpError (status) {
  return { type: httpError.name, status }
}

export function streamError (code, msg) {
  return (dispatch) => {
    dispatch({ type: streamError.name })
    // https://github.com/grpc/grpc/blob/master/doc/statuscodes.md
    switch (code) {
      case 5:
        dispatch(httpError(404))
        return
      case 3:
        dispatch(httpError(400))
        return
      case 16:
        dispatch(httpError(401))
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
