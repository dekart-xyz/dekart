import { useSelector } from 'react-redux'
import styles from './Datasource.module.css'
import { getDatasourceMeta } from './lib/datasource'

export default function Datasource () {
  const env = useSelector(state => state.env)
  if (!env.loaded) {
    return null
  }
  const { DATASOURCE } = env.variables

  const { style } = getDatasourceMeta(DATASOURCE)

  return (
    <div className={styles.datasource}>
      <div className={styles[style]} />
    </div>
  )
}
