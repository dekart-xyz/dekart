import Button from 'antd/es/button'
import styles from './Dataset.module.css'
import Select from 'antd/es/select'
import { useDispatch, useSelector } from 'react-redux'
import Query from './Query'
import File from './File'
import { getDatasourceMeta } from './lib/datasource'
import { createQuery } from './actions/query'
import { createFile } from './actions/file'
import { editConnection, newConnection } from './actions/connection'
import Dropdown from 'antd/es/dropdown'
import { ConsoleSqlOutlined, UploadOutlined, MoreOutlined, CheckCircleTwoTone, ExclamationCircleTwoTone, ClockCircleTwoTone } from '@ant-design/icons'
import ConnectionModal from './ConnectionModal'
import { useEffect, useState } from 'react'
import { updateDataset, updateDatasetConnection } from './actions/dataset'
import Datasource from './Datasource'

function DatasetTypeSelector ({ dataset }) {
  const dispatch = useDispatch()
  const userDefinedConnection = useSelector(state => state.connection.userDefined)
  return (
    <div className={styles.datasetTypeSelector}>
      <Dropdown
        disabled={!dataset.connectionId && userDefinedConnection}
        menu={{
          items: [
            {
              label: 'SQL query',
              icon: <ConsoleSqlOutlined />,
              key: 'sql'
            },
            {
              label: 'File upload',
              icon: <UploadOutlined />,
              key: 'file'
            }
          ],
          onClick: ({ key }) => {
            if (key === 'sql') {
              dispatch(createQuery(dataset.id))
            } else if (key === 'file') {
              dispatch(createFile(dataset.id))
            }
          }
        }}
      >
        <Button block type='primary'>Add data from...</Button>
      </Dropdown>
    </div>
  )
}

const NEW_DATASOURCE = 'NEW_DATASOURCE'
function DatasetSelector ({ dataset }) {
  const dispatch = useDispatch()
  const env = useSelector(state => state.env)
  const userDefinedConnection = useSelector(state => state.connection.userDefined)
  const connectionList = useSelector(state => state.connection.list)
  if (!env.loaded) {
    return null
  }
  // const datasource = getDatasourceMeta(env.variables.DATASOURCE).name
  const { ALLOW_FILE_UPLOAD } = env.variables
  // const userDefinedConnection = BIGQUERY_PROJECT_ID === '' || CLOUD_STORAGE_BUCKET === ''
  if (!ALLOW_FILE_UPLOAD && !userDefinedConnection) {
    return null
  }
  return (
    <div className={styles.datasetSelector}>
      <div className={styles.selector}>
        {userDefinedConnection
          ? (
            <>
              <Datasource />
              <div className={styles.datasource}>
                <Select
                  placeholder='Select connection'
                  className={styles.connectionSelect}
                  value={dataset.connectionId || null}
                  onSelect={value => {
                    if (value === NEW_DATASOURCE) {
                      dispatch(newConnection(dataset.id))
                    } else {
                      dispatch(updateDatasetConnection(dataset.id, value))
                    }
                  }}
                  options={[
                    {
                      value: NEW_DATASOURCE,
                      label: 'New'
                    },
                    ...(connectionList.map(connection => ({
                      value: connection.id,
                      label: connection.connectionName
                    })))
                  ]}
                /><Button
                  type='text'
                  disabled={!dataset.connectionId}
                  title='Edit connection'
                  className={styles.connectionEditButton} onClick={
              () => dispatch(editConnection(dataset.connectionId))
            } icon={<MoreOutlined />}
                  />
              </div>
              <ConnectionModal />
            </>
            )
          : <DatasetTypeSelector dataset={dataset} />}
      </div>
      {
        userDefinedConnection
          ? (
            <div className={styles.status}>
              <DatasetTypeSelector dataset={dataset} />
            </div>

            )
          : null
      }
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
