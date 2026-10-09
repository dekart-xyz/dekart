import Button from 'antd/es/button'
import styles from './Dataset.module.css'
import { useDispatch, useSelector } from 'react-redux'
import Query from './Query'
import File from './File'
import { createQuery } from './actions/query'
import { createFile } from './actions/file'
import { PlusOutlined, ReadOutlined, RightOutlined, UploadOutlined } from '@ant-design/icons'
import { DatasourceIcon } from './Datasource'
import { useHistory } from 'react-router-dom/cjs/react-router-dom'
import { addReadme } from './actions/readme'
import { updateSessionStorage } from './actions/sessionStorage'
import { getDatasourceMeta } from './lib/datasource'
import { track } from './lib/tracking'
import { isSystemConnectionID } from './actions/connection'
import { ConnectionType, QueryExecutionEngine } from 'dekart-proto/dekart_pb'
import { DUCKDB_DATASOURCE } from './lib/duckdb/constants'

function DatasetSelectorButton ({ icon, title, subtitle, onClick, disable, disabledNote }) {
  return (
    <Button
      size='large'
      className={styles.datasetSelectorButton}
      onClick={onClick}
      disabled={disable}
      title={disabledNote}
    >
      <span className={styles.datasetSelectorButtonInner}>
        <span className={styles.datasetSelectorIcon}>{icon}</span>
        {/* REVIEW: Keep each option label and subtitle together beside its icon and navigation arrow. */}
        <span className={styles.datasetSelectorText}>
          <span className={styles.datasetSelectorTitle}>{title}</span>
          <span className={styles.datasetSelectorSubtitle}>{subtitle}</span>
        </span>
        <RightOutlined className={styles.datasetSelectorArrow} />
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

  // LOCAL is upload-only and should not be shown as SQL datasource option.
  // In Dekart Cloud we also hide system/default connection to avoid free BigQuery path.
  const filteredConnectionList = connectionList.filter((c) => {
    if (c.connectionType === ConnectionType.CONNECTION_TYPE_LOCAL) {
      return false
    }
    if (DEKART_CLOUD && isSystemConnectionID(c.id)) {
      return false
    }
    return true
  })
  const history = useHistory()
  const report = useSelector(state => state.report)
  const readOnly = useSelector(state => state.workspace.readOnly)
  const isAdmin = useSelector(state => state.user.isAdmin)
  const fileUploadConnection = connectionList.find(c => c.isDefault && c.canStoreFiles)

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

  const allowFileUpload = ALLOW_FILE_UPLOAD && fileUploadConnection
  let disabledNote = ''
  if (!allowFileUpload) {
    disabledNote = !ALLOW_FILE_UPLOAD ? 'File upload is disabled in configuration' : 'Add default connection with file upload support'
  }

  return (
    <div className={styles.datasetSelector}>
      <div className={styles.datasetSelectorInner}>
        {/* REVIEW: Group file actions separately from SQL sources while preserving write-permission gates. */}
        <section aria-label='File' className={styles.datasetSelectorGroup}>
          <h2>File</h2>
          <div className={styles.datasetSelectorOptions}>
            <DatasetSelectorButton
              icon={<UploadOutlined />}
              disable={!(allowFileUpload && report.canWrite) || readOnly}
              disabledNote={readOnly ? 'Workspace is read-only' : disabledNote}
              title='Upload File'
              subtitle='Load files in CSV, GeoJSON, or Parquet formats'
              onClick={() => {
                track('ClickUploadFileOption', { datasetId: dataset.id })
                dispatch(createFile(dataset.id, fileUploadConnection?.id))
              }}
            />
            {!report.readme && (
              <DatasetSelectorButton
                icon={<ReadOutlined />}
                disable={!report.canWrite || readOnly}
                disabledNote={readOnly ? 'Workspace is read-only' : undefined}
                title='Write README'
                subtitle='Add Markdown description to your map'
                onClick={() => {
                  track('ClickWriteReadme', { datasetId: dataset.id })
                  dispatch(addReadme(dataset.id))
                }}
              />
            )}
          </div>
        </section>
        <section aria-label='Query' className={styles.datasetSelectorGroup}>
          <h2>Query</h2>
          <div className={styles.datasetSelectorOptions}>
            <DatasetSelectorButton
              icon={<DatasourceIcon type={DUCKDB_DATASOURCE} />}
              disable={!report.canWrite || readOnly}
              disabledNote={readOnly ? 'Workspace is read-only' : undefined}
              title='DuckDB'
              subtitle='Transform datasets already in this map'
              onClick={() => {
                track('CreateQueryFromConnection', {
                  datasetId: dataset.id,
                  executionEngine: QueryExecutionEngine.QUERY_EXECUTION_ENGINE_DUCKDB
                })
                dispatch(createQuery(dataset.id, '', QueryExecutionEngine.QUERY_EXECUTION_ENGINE_DUCKDB))
              }}
            />

            {filteredConnectionList.map((connection) => (
              <DatasetSelectorButton
                key={connection.id}
                disable={!report.canWrite || readOnly}
                disabledNote={readOnly ? 'Workspace is read-only' : undefined}
                icon={<DatasourceIcon type={connection.connectionType} />}
                title={`${connection.connectionName}`}
                subtitle={connection.connectionType === ConnectionType.CONNECTION_TYPE_HTTP
                  ? (
                    <span className={styles.datasetSelectorHost} title={connection.httpBaseUrl}>
                      {connection.httpBaseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </span>
                    )
                  : `Run SQL directly on ${getDatasourceMeta(connection.connectionType).name}`}
                onClick={() => {
                  track('CreateQueryFromConnection', {
                    datasetId: dataset.id,
                    connectionId: connection.id,
                    connectionType: connection.connectionType
                  })
                  if (connection.connectionType === ConnectionType.CONNECTION_TYPE_HTTP) {
                    dispatch(createQuery(dataset.id, '', QueryExecutionEngine.QUERY_EXECUTION_ENGINE_DUCKDB,
                      `SELECT * FROM read_json('${connection.httpBaseUrl.replaceAll("'", "''")}')`))
                  } else {
                    dispatch(createQuery(dataset.id, connection.id))
                  }
                }}
              />
            ))}
          </div>
        </section>
      </div>
      {isAdmin && userDefinedConnection && (
        <Button
          id='dekart-add-connection'
          className={styles.manageConnections}
          icon={<PlusOutlined />}
          disabled={readOnly}
          title={readOnly ? 'Workspace is read-only' : undefined}
          onClick={() => {
            dispatch(updateSessionStorage('redirectWhenSaveConnection', { reportId: report.id, edit: true }))
            track('AddAndEditConnections')
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
