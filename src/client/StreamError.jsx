import Button from 'antd/es/button'

export default function StreamError ({ code, message }) {
  return (
    <span>{message}  <Button onClick={() => window.location.reload()} size='small'>Reload Page</Button></span>
  )
}
