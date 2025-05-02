import Button from 'antd/es/button'

export default function PermanentError ({ code, message }) {
  return (
    <span>{message}  <Button onClick={() => window.location.reload()} size='small'>Reload Page</Button></span>
  )
}
