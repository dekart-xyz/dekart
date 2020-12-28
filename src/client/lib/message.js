import { Button, message } from 'antd'

const style = { marginTop: 60 }

function StreamError ({ code }) {
  return (<span>Disconnected From Dekart backend (code={code}) <Button onClick={() => window.location.reload()} size='small'>Reload Page</Button></span>)
}

export function downloading () {
  return message.loading({
    content: 'Downloading Map Data...',
    duration: 0,
    style
  })
}
export function success (content) {
  message.success({
    content,
    style
  })
}

export function genericError (err) {
  message.error({
    content: err.message,
    style
  })
}

export function streamError (code) {
  message.error({
    content: (<StreamError code={code} />),
    duration: 10000,
    style
  })
}
