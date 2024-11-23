import Form from 'antd/es/form'
import Input from 'antd/es/input'
import Modal from 'antd/es/modal'
import { useSelector, useDispatch } from 'react-redux'
import Button from 'antd/es/button'
import styles from './ConnectionModal.module.css'
import { useEffect } from 'react'
import { archiveConnection, closeConnectionDialog, connectionChanged, reOpenDialog, saveConnection, testConnection } from './actions/connection'
import { CheckCircleTwoTone, ExclamationCircleTwoTone, LoadingOutlined } from '@ant-design/icons'
import Tooltip from 'antd/es/tooltip'
import AutoComplete from 'antd/es/auto-complete'
import Alert from 'antd/es/alert'
import { Connection, PlanType } from '../proto/dekart_pb'
import { DatasourceIcon } from './Datasource'
import { track } from './lib/tracking'

function Footer ({ form, testDisabled }) {
  const { dialog, test } = useSelector(state => state.connection)
  const { tested, testing, error: testError, success: testSuccess } = test
  const { id, loading, connectionType } = dialog
  const isAdmin = useSelector(state => state.user.isAdmin)
  const dispatch = useDispatch()

  return (
    <div className={styles.modalFooter}>
      <Button
        type='primary' disabled={testing || tested || testDisabled} loading={testing} onClick={() => {
          track('TestConnection')
          dispatch(testConnection(connectionType, form.getFieldsValue()))
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
        type={tested && testSuccess ? 'primary' : 'default'} disabled={((!tested || loading) && !testDisabled) || !isAdmin} onClick={() => {
          track('SaveConnection')
          dispatch(saveConnection(id, connectionType, form.getFieldsValue()))
        }}
      >
        Save
      </Button>
      <Button disabled={!id || !isAdmin} onClick={() => dispatch(archiveConnection(id))}>
        Archive
      </Button>
    </div>
  )
}

function SnowflakeConnectionModal ({ form }) {
  const { dialog } = useSelector(state => state.connection)
  const { id, loading } = dialog
  const dispatch = useDispatch()
  const connection = useSelector(state => state.connection.list.find(s => s.id === id))
  const datasetUsed = connection?.datasetCount > 0
  const passwordChanged = form.getFieldValue('snowflakePassword') !== connection?.snowflakePassword

  return (
    <Modal
      open
      title={<><DatasourceIcon type={Connection.ConnectionType.CONNECTION_TYPE_SNOWFLAKE} /> Snowflake</>}
      onCancel={() => dispatch(closeConnectionDialog())}
      footer={<Footer form={form} testDisabled={!passwordChanged} />}
    >
      <div className={styles.modalBody}>
        <Form
          form={form}
          disabled={loading}
          layout='vertical' onValuesChange={(changedValues, allValues) => {
            if (changedValues.snowflakeAccountId) {
              const snowflakeAccountId = changedValues.snowflakeAccountId
              form.setFieldsValue({
                snowflakeAccountId: snowflakeAccountId.replace('.', '-')
              })
            }
            dispatch(connectionChanged())
          }}
        >
          {datasetUsed ? <div className={styles.datasetsCountAlert}><Alert message={<>This connection is used in {connection.datasetCount} dataset{connection.datasetCount > 1 ? 's' : ''}.</>} description='Changing make cause report errors' type='warning' /></div> : null}
          <Form.Item label='Connection Name' required name='connectionName'>
            <Input placeholder='Snowflake' />
          </Form.Item>
          <Form.Item
            required label='Snowflake Account ID' name='snowflakeAccountId' extra={
              <><a href='https://docs.snowflake.com/en/user-guide/admin-account-identifier#using-an-account-name-as-an-identifier' target='_blank' rel='noreferrer'>Snowflake Account Identifier</a> that your Snowflake cluster is running.</>
            }
          >
            <Input placeholder='ORGNAME-ACCOUNT_NAME' />
          </Form.Item>
          <Form.Item required label='Snowflake Username' name='snowflakeUsername' extra='The database username for the account that you want to use to connect to your database.'>
            <Input placeholder='USERNAME' />
          </Form.Item>
          <Form.Item required label='Snowflake Password' name='snowflakePassword' extra={<>The password for the username that you use to connect to the database.</>}>
            <Input.Password
              placeholder='PASSWORD' visibilityToggle={passwordChanged} onFocus={() => {
                if (!passwordChanged) {
                  form.setFieldsValue({ snowflakePassword: '' })
                }
              }} onBlur={() => {
                if (form.getFieldValue('snowflakePassword') === '') {
                  form.setFieldsValue({ snowflakePassword: connection?.snowflakePassword })
                }
              }}
            />
          </Form.Item>
          <Form.Item label='Snowflake Warehouse' name='snowflakeWarehouse' extra='Optional: Snowflake warehouse. If the user lacks a default warehouse, you’ll need to enter the warehouse to connect to.'>
            <Input />
          </Form.Item>
        </Form>
      </div>
    </Modal>
  )
}
function BigQueryConnectionModal ({ form }) {
  const { dialog, projects } = useSelector(state => state.connection)
  const { id, loading } = dialog
  const dispatch = useDispatch()
  const connection = useSelector(state => state.connection.list.find(s => s.id === id))
  const planType = useSelector(state => state.user.stream.planType)
  useEffect(() => {
    track('BigQueryConnectionModal')
  }, [])

  // only name can be changed for connections used in datasets
  const nameChangeOnly = connection?.datasetCount > 0

  return (
    <Modal
      open
      title={<><DatasourceIcon type={Connection.ConnectionType.CONNECTION_TYPE_BIGQUERY} /> BigQuery</>}
      onCancel={() => dispatch(closeConnectionDialog())}
      footer={<Footer form={form} testDisabled={nameChangeOnly} />}
    >
      <div className={styles.modalBody}>
        <Form
          form={form}
          disabled={loading}
          layout='vertical' onValuesChange={(changedValues, allValues) => {
            if (changedValues.bigqueryProjectId || changedValues.cloudStorageBucket) {
              dispatch(connectionChanged())
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
          <Form.Item required={planType === PlanType.TYPE_PREMIUM} label={planType === PlanType.TYPE_PREMIUM ? 'Storage Bucket' : 'Optional: Storage Bucket'} extra={<>Google Cloud Storage bucket to permanently cache query results. Required to share map with other users.</>} name='cloudStorageBucket'>
            <Input placeholder='my-gcs-bucket' disabled={nameChangeOnly} />
          </Form.Item>
        </Form>
      </div>
    </Modal>
  )
}

export default function ConnectionModal () {
  const { dialog } = useSelector(state => state.connection)
  const { visible, id, connectionType } = dialog
  const dispatch = useDispatch()

  useEffect(() => {
    dispatch(reOpenDialog())
  }, [dispatch])

  const connection = useSelector(state => state.connection.list.find(s => s.id === id))

  const [form] = Form.useForm()

  useEffect(() => {
    if (connection) {
      form.setFieldsValue(connection)
    }
  }, [connection, form])

  if (!visible) {
    return null
  }
  switch (connectionType) {
    case Connection.ConnectionType.CONNECTION_TYPE_SNOWFLAKE:
      return <SnowflakeConnectionModal form={form} />
    case Connection.ConnectionType.CONNECTION_TYPE_BIGQUERY:
    default:
      return <BigQueryConnectionModal form={form} />
  }
}
