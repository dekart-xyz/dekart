import Form from 'antd/es/form'
import Input from 'antd/es/input'
import Modal from 'antd/es/modal'
import { useSelector, useDispatch } from 'react-redux'
import Button from 'antd/es/button'
import styles from './ConnectionModal.module.css'
import { useEffect } from 'react'
import { archiveConnection, closeConnectionDialog, connectionChanged, saveConnection, testConnection } from './actions/connection'
import { CheckCircleTwoTone, ExclamationCircleTwoTone } from '@ant-design/icons'
import Tooltip from 'antd/es/tooltip'
import AutoComplete from 'antd/es/auto-complete'
import Alert from 'antd/es/alert'

function Footer ({ form }) {
  const { dialog, test } = useSelector(state => state.connection)
  const { tested, testing, error: testError, success: testSuccess } = test
  const { id, loading } = dialog

  const connection = useSelector(state => state.connection.list.find(s => s.id === id))

  const dispatch = useDispatch()

  return (
    <div className={styles.modalFooter}>
      <Button
        type='primary' disabled={testing || tested} loading={testing} onClick={() => {
          dispatch(testConnection(form.getFieldsValue()))
        }}
      >
        Test Connection
      </Button>
      {
    tested
      ? <div className={styles.testStatus}>{testError ? <Tooltip title={testError}><ExclamationCircleTwoTone twoToneColor='#f5222d' /></Tooltip> : <CheckCircleTwoTone twoToneColor='#52c41a' />}</div>
      : null
  }
      <div className={styles.spacer} />
      <Button
        id='saveConnection'
        type={tested && testSuccess ? 'primary' : 'default'} disabled={!tested || loading} danger={connection?.datasetCount > 0} onClick={() => {
          dispatch(saveConnection(id, form.getFieldsValue()))
        }}
        title={connection?.datasetCount > 0 ? 'This connection is used in dataset. Modifying it may lead to errors in reports. Consider creating new connection and archiving this one' : 'Save connection'}
      >
        Save
      </Button>
      <Button onClick={() => dispatch(archiveConnection(id))}>
        Archive
      </Button>
    </div>
  )
}

export default function ConnectionModal () {
  const { dialog, projects } = useSelector(state => state.connection)
  const { visible, id, loading } = dialog

  const env = useSelector(state => state.env)
  const { BIGQUERY_PROJECT_ID, CLOUD_STORAGE_BUCKET } = env.variables

  const connection = useSelector(state => state.connection.list.find(s => s.id === id))

  const dispatch = useDispatch()
  const [form] = Form.useForm()

  useEffect(() => {
    if (connection) {
      form.setFieldsValue(connection)
    }
    if (BIGQUERY_PROJECT_ID) {
      form.setFieldsValue({ bigqueryProjectId: BIGQUERY_PROJECT_ID })
    }
    if (CLOUD_STORAGE_BUCKET) {
      form.setFieldsValue({ cloudStorageBucket: CLOUD_STORAGE_BUCKET })
    }
  }, [connection, BIGQUERY_PROJECT_ID, CLOUD_STORAGE_BUCKET, form])

  if (!visible) {
    return null
  }
  return (
    <Modal
      open
      title='Edit Connection'
      onCancel={() => dispatch(closeConnectionDialog())}
      footer={<Footer form={form} />}
    >
      <div className={styles.modalBody}>
        <Form
          form={form}
          disabled={loading}
          layout='vertical' onValuesChange={(changedValues, allValues) => {
            if (changedValues.bigqueryProjectId || changedValues.cloudStorageBucket) {
              dispatch(connectionChanged(allValues))
            }
            if (changedValues.bigqueryProjectId && !allValues.connectionName) {
              form.setFieldsValue({ connectionName: changedValues.bigqueryProjectId })
            }
          }}
        >
          {connection?.datasetCount > 0 ? <div className={styles.datasetsCountAlert}><Alert message={<>Danger zone! This connection is used in {connection.datasetCount} dataset{connection.datasetCount > 1 ? 's' : ''}.</>} description="Modifying it may lead to queries and results not being found in reports. Consider creating new connection and archiving this one. Modifying name is safe." type="error" /></div> : null}
          <Form.Item label='Google Cloud project ID' extra='used to bill BigQuery jobs' required name='bigqueryProjectId'>
            {
              projects.length > 0 && !BIGQUERY_PROJECT_ID
                ? (
                  <AutoComplete
                    options={projects.map(project => ({ value: project, label: project }))}
                    filterOption={(inputValue, option) => option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1}
                  />
                  )
                : <Input readOnly={BIGQUERY_PROJECT_ID} />
              }
          </Form.Item>
          <Form.Item label='Connection Name' required name='connectionName'>
            <Input />
          </Form.Item>
          <Form.Item label='Optional Google Cloud Storage bucket' extra='to store files and result cache ' name='cloudStorageBucket'>
            <Input placeholder='my-company-storage-bucket' readOnly={CLOUD_STORAGE_BUCKET} />
          </Form.Item>
        </Form>
      </div>
    </Modal>
  )
}
