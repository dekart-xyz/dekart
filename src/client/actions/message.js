import message from 'antd/es/message'
import StreamError from '../StreamError'

const style = { /* marginTop: 0 */ }

message.config({ top: 40 })

export function downloading (query) {
  return { type: downloading.name, query }
}

export function finishDownloading (query) {
  return { type: finishDownloading.name, query }
}

export function success (content) {
  message.success({
    content,
    style
  })
  return { type: success.name }
}

export function error (err) {
  console.error(err)
  message.error({
    content: err.message,
    style
  })
  return { type: error.name }
}

export function httpError (status) {
  return { type: httpError.name, status }
}

export function streamError (code) {
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
          content: (<StreamError code={code} />),
          duration: 10000,
          style
        })
    }
  }
}
