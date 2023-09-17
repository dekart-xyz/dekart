import Button from 'antd/es/button'
import styles from './Dataset.module.css'
import Select from 'antd/es/select'
import { useDispatch, useSelector } from 'react-redux'
import Query from './Query'
import File from './File'
import { getDatasourceMeta } from './lib/datasource'
import { createQuery } from './actions/query'
import { createFile } from './actions/file'
import { newConnection } from './actions/connection'
import Dropdown from 'antd/es/dropdown'
import { ConsoleSqlOutlined, UploadOutlined, MoreOutlined, CheckCircleTwoTone, ExclamationCircleTwoTone, ClockCircleTwoTone } from '@ant-design/icons'
import ConnectionModal from './ConnectionModal'

const NEW_DATASOURCE = 'NEW_DATASOURCE'
function DatasetSelector ({ dataset }) {
  const dispatch = useDispatch()
  const env = useSelector(state => state.env)
  const connectionList = useSelector(state => state.connection.list)
  if (!env.loaded) {
    return null
  }
  const datasource = getDatasourceMeta(env.variables.DATASOURCE).name
  const { ALLOW_FILE_UPLOAD, BIGQUERY_PROJECT_ID, CLOUD_STORAGE_BUCKET } = env.variables
  const userDefinedDatasource = BIGQUERY_PROJECT_ID === '' || CLOUD_STORAGE_BUCKET === ''
  if (!ALLOW_FILE_UPLOAD && !userDefinedDatasource) {
    return null
  }
  console.log('connectionList', connectionList)
  return (
    <div className={styles.datasetSelector}>
      <div className={styles.selector}>
        <div className={styles.datasourceType} />
        <div className={styles.datasource}>
          <Select
            placeholder='Select data source'
            className={styles.connectionSelect}
            onSelect={value => {
              if (value === NEW_DATASOURCE) {
                dispatch(newConnection())
              }
            }}
            // defaultValue='lucy'
            // style={{ width: 120 }}
            // onChange={handleChange}
            options={[
              {
                value: NEW_DATASOURCE,
                label: 'New'
              },
              ...(connectionList.map(connection => ({
                value: connection.id,
                label: connection.sourceName
              })))
            ]}
          /><Button className={styles.connectionEditButton} icon={<MoreOutlined />} />
        </div>
        <ConnectionModal />
        {/* <div className={styles.selectorButtons}>
          <Button block onClick={() => dispatch(createQuery(dataset.id))}>{datasource} query</Button>
          {ALLOW_FILE_UPLOAD && <Button block onClick={() => dispatch(createFile(dataset.id))}>Upload file</Button>}
        </div> */}
      </div>
      <div className={styles.status}>
        <div className={styles.datasetTypeSelector}>
          <Dropdown
            menu={{
              items: [
                {
                  label: 'SQL query',
                  icon: <ConsoleSqlOutlined />
                  // onClick: () => dispatch(createQuery(dataset.id))
                },
                {
                  label: 'File upload',
                  icon: <UploadOutlined />
                  // onClick: () => dispatch(createFile(dataset.id))
                }
              ]
            }}
          >
            <Button block type='primary'>Add data from...</Button>
          </Dropdown>
        </div>
      </div>
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
