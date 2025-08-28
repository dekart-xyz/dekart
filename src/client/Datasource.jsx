import { useSelector } from 'react-redux'
import styles from './Datasource.module.css'
import { getDatasourceMeta } from './lib/datasource'
import classNames from 'classnames'
import { ConsoleSqlOutlined } from '@ant-design/icons'

export function Datasource ({ connection }) {
  const env = useSelector(state => state.env)
  if (!env.loaded) {
    return null
  }
  const { DATASOURCE } = env.variables

  let { style } = getDatasourceMeta(DATASOURCE)

  if (connection) {
    const { connectionType } = connection
    style = getDatasourceMeta(connectionType).style
  }

  return (
    <div className={styles.datasource}>
      <div className={styles[style]} />
    </div>
  )
}

export function DatasourceIcon ({ type }) {
  const style = getDatasourceMeta(type).style
  if (!style) {
    return <ConsoleSqlOutlined />
  }
  return (
    <span className={classNames(
      styles.datasourceIcon,
      'anticon',
      styles[getDatasourceMeta(type).style]
    )}
    />
  )
}
