import message from 'antd/es/message'
import Downloading from '../Downloading'
import StreamError from '../StreamError'

const style = { marginTop: 60 }

let hideDownloading = null
export function downloading (query) {
  const { resultSize } = query
  hideDownloading = message.loading({
    content: <Downloading size={resultSize} />,
    duration: 0,
    style
  })
  return { type: downloading.name }
}

export function finishDownloading () {
  if (hideDownloading) {
    hideDownloading()
    hideDownloading = null
  }
  return { type: finishDownloading.name }
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
