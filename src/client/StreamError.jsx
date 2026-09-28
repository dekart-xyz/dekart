import Button from 'antd/es/button'
import ReportIssueLink from './ReportIssueLink'
import errorStyles from './ErrorMessage.module.css'

export default function StreamError ({ code, message }) {
  return (
    <span className={errorStyles.content}>
      <span className={errorStyles.text}>{message}</span>
      <span className={errorStyles.actions}>
        <ReportIssueLink category='stream error' />
        <Button type='primary' onClick={() => window.location.reload()}>Reload page</Button>
      </span>
    </span>
  )
}
