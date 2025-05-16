import Button from 'antd/es/button'
import styles from './Dataset.module.css'
import { useDispatch, useSelector } from 'react-redux'
import Query from './Query'
import File from './File'
import { createQuery } from './actions/query'
import { createFile } from './actions/file'
import { ApiTwoTone, InboxOutlined, ReadOutlined } from '@ant-design/icons'
import { DatasourceIcon } from './Datasource'
import { useHistory } from 'react-router-dom/cjs/react-router-dom'
import { addReadme } from './actions/readme'
import { updateSessionStorage } from './actions/sessionStorage'
import { getDatasourceMeta } from './lib/datasource'

function DatasetSelectorButton ({ icon, title, subtitle, onClick }) {
  return (
    <Button
      size='large'
      className={styles.datasetSelectorButton}
      onClick={onClick}
    >
      <span className={styles.datasetSelectorButtonInner}>
        <span className={styles.datasetSelectorIcon}>{icon}</span>
        <span className={styles.datasetSelectorTitle}>{title}</span>
        <span className={styles.datasetSelectorSubtitle}>{subtitle}</span>
      </span>
    </Button>
  )
}

function DatasetSelector ({ dataset }) {
  const dispatch = useDispatch()
  const env = useSelector(state => state.env)
  const userDefinedConnection = useSelector(state => state.connection.userDefined)
  const isPlayground = useSelector(state => state.user.isPlayground)
  const isDefaultWorkspace = useSelector(state => state.user.isDefaultWorkspace)
  const connectionList = useSelector(state => state.connection.list)
  const noneDefaultConnectionList = connectionList.filter(c => c.id !== 'default')
  const history = useHistory()
  const report = useSelector(state => state.report)
  const isAdmin = useSelector(state => state.user.isAdmin)
  if (!env.loaded) {
    // do not render until environment is loaded
    return null
  }
  if (isPlayground && !isDefaultWorkspace) {
    // do not render in playground mode, but render in default workspace
    return null
  }
  const { ALLOW_FILE_UPLOAD } = env.variables
  if (!ALLOW_FILE_UPLOAD && !userDefinedConnection) {
    return null
  }
  return (
    <div className={styles.datasetSelector}>
      <div className={styles.datasetSelectorInner}>
        <DatasetSelectorButton
          icon={<InboxOutlined />}
          title='Upload File'
          subtitle='Load files in CSV or GeoJSON formats'
          onClick={() => {
            dispatch(createFile(dataset.id))
          }}
        />
        {!report.readme && (
          <DatasetSelectorButton
            icon={<ReadOutlined />}
            title='Write README'
            subtitle='Add Markdown description to your map'
            onClick={() => {
              dispatch(addReadme(dataset.id))
            }}
          />
        )}

        {noneDefaultConnectionList.map((connection) => (
          <DatasetSelectorButton
            key={connection.id}
            icon={<DatasourceIcon type={connection.connectionType} />}
            title={`${getDatasourceMeta(connection.connectionType).name} SQL (${connection.connectionName})`}
            subtitle={`Run SQL directly on ${getDatasourceMeta(connection.connectionType).name}`}
            onClick={() => {
              dispatch(createQuery(dataset.id, connection.id))
            }}
          />
        ))}
        {noneDefaultConnectionList.length === 0 && (
          <DatasetSelectorButton
            icon={<ApiTwoTone />}
            title='Add connection'
            subtitle='Connect BigQuery or Snowflake'
            onClick={() => {
              dispatch(updateSessionStorage('redirectWhenSaveConnection', { reportId: report.id, edit: true }))
              history.push('/connections')
            }}
          />
        )}
      </div>
      {isAdmin && noneDefaultConnectionList.length > 0 && (
        <Button
          type='link'
          onClick={() => {
            history.push('/connections')
          }}
        >
          Add and edit connections
        </Button>
      )}
    </div>
  )
}

export default function Dataset ({ dataset }) {
  let query = null
  let file = null
  const queries = useSelector(state => state.queries)
  const files = useSelector(state => state.files)
  if (dataset.queryId) {
    query = queries.find(q => q.id === dataset.queryId)
  } else if (dataset.fileId) {
    file = files.find(f => f.id === dataset.fileId)
  }
  return (
    <>
      {query ? <Query query={query} /> : file ? <File file={file} /> : <DatasetSelector dataset={dataset} />}
    </>
  )
}
