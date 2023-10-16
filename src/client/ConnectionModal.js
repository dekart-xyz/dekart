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

function Footer ({ form }) {
  const { dialog, test } = useSelector(state => state.connection)
  const { tested, testing, error: testError, success: testSuccess } = test
  const { id, loading } = dialog

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
        type={tested && testSuccess ? 'primary' : 'default'} disabled={!tested || loading} onClick={() => {
          dispatch(saveConnection(id, form.getFieldsValue()))
        }}
      >
        Save
      </Button>
      <Button danger onClick={() => dispatch(archiveConnection(id))}>
        Archive
      </Button>
    </div>
  )
}

export default function ConnectionModal () {
  const { dialog } = useSelector(state => state.connection)
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
  }, [connection, BIGQUERY_PROJECT_ID, CLOUD_STORAGE_BUCKET])

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
          }}
        >
          <Form.Item label='Connection Name' name='connectionName' required>
            <Input />
          </Form.Item>
          <Form.Item label='Google Cloud project ID' extra='used to access BigQuery' required name='bigqueryProjectId'>
            <Input readOnly={BIGQUERY_PROJECT_ID} />
          </Form.Item>
          <Form.Item label='Google Cloud Storage bucket' extra='where queries, files and query results stored' required name='cloudStorageBucket'>
            <Input placeholder='my-company-storage-bucket' readOnly={CLOUD_STORAGE_BUCKET} />
          </Form.Item>
        </Form>
      </div>
    </Modal>
  )
}
