import styles from './Loading.module.css'
import SpinFC from 'antd/es/spin'

export function Loading () {
  return (
    <div className={styles.loading}>
      <SpinFC size='large' />
    </div>
  )
}
