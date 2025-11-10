import styles from './Loading.module.css'
import SpinFC from 'antd/es/spin'

export function Loading ({ verticalShift = 0 }) {
  return (
    <div className={styles.loading} style={{ height: `calc(100vh - ${verticalShift}px)` }}>
      <SpinFC size='large' />
    </div>
  )
}
