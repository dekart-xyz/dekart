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
import { track } from './lib/tracking'

function DatasetSelectorButton ({ icon, title, subtitle, onClick, id, disable, disabledNote }) {
  return (
    <Button
      id={id}
      size='large'
      className={styles.datasetSelectorButton}
      onClick={onClick}
      disabled={disable}
      title={disabledNote}
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
  const { ALLOW_FILE_UPLOAD, DEKART_CLOUD } = env.variables
  const connectionList = useSelector(state => state.connection.list)

  // filter out default connection in Dekart Cloud, so user cannot use BigQuery free
  const filteredConnectionList = DEKART_CLOUD ? connectionList.filter(c => c.id !== 'default') : connectionList
  const history = useHistory()
  const report = useSelector(state => state.report)
  const isAdmin = useSelector(state => state.user.isAdmin)
  const { uxConfig } = useSelector(state => state.env)
  const workspaceId = useSelector(state => state.user.stream?.workspaceId)
  const defaultConnection = connectionList.find(c => c.isDefault)

  if (!env.loaded) {
    // do not render until environment is loaded
    return null
  }
  if (isPlayground && !isDefaultWorkspace) {
    // do not render in playground mode, but render in default workspace
    return null
  }
  if (!ALLOW_FILE_UPLOAD && !userDefinedConnection) {
    return null
  }

  let allowFileUpload = false
  let disabledNote = 'File upload is disabled in configuration'
  if (ALLOW_FILE_UPLOAD && userDefinedConnection) {
    // check if selected connection supports file upload
    allowFileUpload = defaultConnection?.canStoreFiles
    if (allowFileUpload) {
      disabledNote = ''
    } else {
      disabledNote = 'Add connection with file upload support to enable this button'
    }
  }

  return (
    <div className={styles.datasetSelector}>
      <div className={styles.datasetSelectorInner}>
        <DatasetSelectorButton
          icon={<InboxOutlined />}
          disable={!allowFileUpload}
          disabledNote={disabledNote}
          title='Upload File'
          subtitle='Load files in CSV or GeoJSON formats'
          onClick={() => {
            dispatch(createFile(dataset.id, defaultConnection.id))
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

        {filteredConnectionList.map((connection) => (
          <DatasetSelectorButton
            key={connection.id}
            icon={<DatasourceIcon type={connection.connectionType} />}
            title={`${connection.connectionName}`}
            subtitle={`Run SQL directly on ${getDatasourceMeta(connection.connectionType).name}`}
            onClick={() => {
              dispatch(createQuery(dataset.id, connection.id))
            }}
          />
        ))}
        {filteredConnectionList.length === 0 && (
          <DatasetSelectorButton
            icon={<ApiTwoTone />}
            id='dekart-add-connection'
            title='Add connection'
            subtitle={uxConfig?.enableWherobotsWorkspaces?.includes(workspaceId) ? 'Connect BigQuery, Snowflake, Wherobots' : 'Connect BigQuery, Snowflake'}
            onClick={() => {
              dispatch(updateSessionStorage('redirectWhenSaveConnection', { reportId: report.id, edit: true }))
              history.push('/connections')
              track('AddConnectionFromDatasetSelector')
            }}
          />
        )}
      </div>
      {isAdmin && filteredConnectionList.length > 0 && (
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
