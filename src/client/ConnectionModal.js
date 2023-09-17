import Form from 'antd/es/form'
import Input from 'antd/es/input'
import Modal from 'antd/es/modal'
import { useSelector, useDispatch } from 'react-redux'
import Button from 'antd/es/button'
import styles from './ConnectionModal.module.css'
import { useState, useEffect } from 'react'
import { connectionChanged, saveConnection, testConnection } from './actions/connection'
import { ConsoleSqlOutlined, UploadOutlined, CheckCircleTwoTone, ExclamationCircleTwoTone, ClockCircleTwoTone } from '@ant-design/icons'
import Tooltip from 'antd/es/tooltip'

export default function ConnectionModal () {
  const { dialog, test } = useSelector(state => state.connection)
  const { visible, id, loading } = dialog
  const source = useSelector(state => state.connection.list.find(s => s.id === id))
  const { tested, testing, error: testError, success: testSuccess } = test
  const dispatch = useDispatch()
  const [form] = Form.useForm()
  useEffect(() => {
    if (source) {
      form.setFieldsValue(source)
    }
  }, [source])
  const [testConnectionEnabled, setTestConnectionEnabled] = useState(false)
  if (!visible) {
    return null
  }
  return (
    <Modal
      open
      title='Edit Connection'
      footer={(
        <div className={styles.modalFooter}>
          <Button
            type='primary' disabled={!testConnectionEnabled || testing || tested} loading={testing} onClick={() => {
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
          <Button>
            Cancel
          </Button>
        </div>
          )}
    >
      <div className={styles.modalBody}>
        <Form
          form={form}
          disabled={loading}
          layout='vertical' onValuesChange={(changedValues, allValues) => {
            if (changedValues.bigqueryProjectId || changedValues.cloudStorageBucket) {
              dispatch(connectionChanged(allValues))
            }
            setTestConnectionEnabled(allValues.sourceName && allValues.bigqueryProjectId && allValues.cloudStorageBucket)
          }}
        >
          <Form.Item label='Connection Name' name='sourceName' required>
            <Input />
          </Form.Item>
          <Form.Item label='Google Cloud project ID' extra='used to access BigQuery' required name='bigqueryProjectId'>
            <Input />
          </Form.Item>
          <Form.Item label='Google Cloud Storage bucket' extra='where queries, files and query results stored' required name='cloudStorageBucket'>
            <Input placeholder='my-company-storage-bucket' />
          </Form.Item>
        </Form>
      </div>
    </Modal>
  )
}
