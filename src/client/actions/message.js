import Button from 'antd/es/button'
import message from 'antd/es/message'

const style = { marginTop: 60 }

function StreamError ({ code }) {
  return (<span>Disconnected From Dekart backend (code={code}) <Button onClick={() => window.location.reload()} size='small'>Reload Page</Button></span>)
}

let hideDownloading = null
export function downloading () {
  hideDownloading = message.loading({
    content: 'Downloading Map Data...',
    duration: 0,
    style
  })
  return { type: downloading.name }
}

export function finishDownloading () {
  if (hideDownloading) {
    hideDownloading()
    hideDownloading = null
    return { type: finishDownloading.name }
  }
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

export function streamError (code) {
  message.error({
    content: (<StreamError code={code} />),
    duration: 10000,
    style
  })
  return { type: streamError.name }
}
