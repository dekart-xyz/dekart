import Button from 'antd/es/button'

export default function StreamError ({ code }) {
  return (<span>Disconnected From Dekart backend (code={code}) <Button onClick={() => window.location.reload()} size='small'>Reload Page</Button></span>)
}
