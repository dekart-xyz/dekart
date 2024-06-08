import Form from 'antd/es/form'
import Input from 'antd/es/input'
import Modal from 'antd/es/modal'
import { useSelector, useDispatch } from 'react-redux'
import Button from 'antd/es/button'
import styles from './ConnectionModal.module.css'
import { useEffect } from 'react'
import { archiveConnection, closeConnectionDialog, connectionChanged, saveConnection, testConnection } from './actions/connection'
import { CheckCircleTwoTone, ExclamationCircleTwoTone, LoadingOutlined } from '@ant-design/icons'
import Tooltip from 'antd/es/tooltip'
import AutoComplete from 'antd/es/auto-complete'
import Alert from 'antd/es/alert'

function Footer ({ form }) {
  const { dialog, test } = useSelector(state => state.connection)
  const { tested, testing, error: testError, success: testSuccess } = test
  const { id, loading } = dialog

  const connection = useSelector(state => state.connection.list.find(s => s.id === id))

  // only name can be changed for connections used in datasets
  const nameChangeOnly = connection?.datasetCount > 0

  const dispatch = useDispatch()

  return (
    <div className={styles.modalFooter}>
      <Button
        type='primary' disabled={testing || tested || nameChangeOnly} loading={testing} onClick={() => {
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
        type={tested && testSuccess ? 'primary' : 'default'} disabled={(!tested || loading) && !nameChangeOnly} onClick={() => {
          dispatch(saveConnection(id, form.getFieldsValue()))
        }}
      >
        Save
      </Button>
      <Button disabled={!id} onClick={() => dispatch(archiveConnection(id))}>
        Archive
      </Button>
    </div>
  )
}

export default function ConnectionModal () {
  const { dialog, projects } = useSelector(state => state.connection)
  const { visible, id, loading } = dialog

  const connection = useSelector(state => state.connection.list.find(s => s.id === id))

  // only name can be changed for connections used in datasets
  const nameChangeOnly = connection?.datasetCount > 0

  const dispatch = useDispatch()
  const [form] = Form.useForm()

  useEffect(() => {
    if (connection) {
      form.setFieldsValue(connection)
    }
  }, [connection, form, nameChangeOnly])

  if (!visible) {
    return null
  }
  return (
    <Modal
      open
      title='BigQuery'
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
          {nameChangeOnly ? <div className={styles.datasetsCountAlert}><Alert message={<>This connection is used in {connection.datasetCount} dataset{connection.datasetCount > 1 ? 's' : ''}.</>} description='Only the name can be changed.' type='warning' /></div> : null}
          <Form.Item
            label='Project ID' extra={(() => {
              if (projects) {
                return projects.length ? 'Click to select you BigQuery project ID' : <>→ <a target='_blank' href='https://dekart.xyz/docs/configuration/environment-variables/?ref=no-gcp-project#user-authorization-via-google-oauth-20-flow' rel='noreferrer'>Ensure your account has access to the Google Cloud Project</a></>
              }
              return <LoadingOutlined />
            })()} required name='bigqueryProjectId'
          >
            <AutoComplete
              options={(projects || []).map(project => ({ value: project, label: project }))}
              // suffixIcon={<DownOutlined />}
              showArrow
              disabled={nameChangeOnly}
              filterOption={(inputValue, option) => option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1}
            />
          </Form.Item>
          <Form.Item label='Connection Name' required name='connectionName'>
            <Input />
          </Form.Item>
          <Form.Item label='Optional: Storage Bucket' extra={<>Google Cloud Storage bucket to permanently cache query results. Required to share map with other users.</>} name='cloudStorageBucket'>
            <Input placeholder='my-gcs-bucket' disabled={nameChangeOnly} />
          </Form.Item>
        </Form>
      </div>
    </Modal>
  )
}
