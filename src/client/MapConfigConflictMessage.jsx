import Button from 'antd/es/button'
import { CloseOutlined } from '@ant-design/icons'
import styles from './MapConfigConflictMessage.module.css'

export default function MapConfigConflictMessage ({ onReload, onDismiss }) {
  return (
    <span> Map changed <Button size='small' className={styles.reloadButton} onClick={onReload}>Reload</Button>
      <Button
        size='small'
        type='text'
        icon={<CloseOutlined />}
        aria-label='Dismiss'
        onClick={onDismiss}
        className={styles.closeButton}
      />
    </span>
  )
}
