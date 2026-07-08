import Form from 'antd/es/form'
import Input from 'antd/es/input'
import Modal from 'antd/es/modal'
import Select from 'antd/es/select'
import { useSelector, useDispatch } from 'react-redux'
import Button from 'antd/es/button'
import styles from './ConnectionModal.module.css'
import { useEffect, useState } from 'react'
import { archiveConnection, closeConnectionDialog, connectionChanged, getWherobotsConnectionHint, reOpenDialog, saveConnection, testConnection } from './actions/connection'
import { CheckCircleTwoTone, ExclamationCircleTwoTone, InfoCircleOutlined, LoadingOutlined, LockOutlined } from '@ant-design/icons'
import Tooltip from 'antd/es/tooltip'
import AutoComplete from 'antd/es/auto-complete'
import Alert from 'antd/es/alert'
import { ConnectionType } from 'dekart-proto/dekart_pb'
import { DatasourceIcon } from './Datasource'
import { track } from './lib/tracking'
import TextArea from 'antd/es/input/TextArea'

function connectionTestFieldsChanged (changedValues, fields) {
  return fields.some(field => Object.prototype.hasOwnProperty.call(changedValues, field))
}

function Footer ({ form, saveWithoutTest = false, testDisabled = false, archiveBeforeSave = false, primaryTest = true }) {
  const { dialog, test } = useSelector(state => state.connection)
  const { tested, testing, error: testError, success: testSuccess } = test
  const { id, loading, connectionType } = dialog
  const isAdmin = useSelector(state => state.user.isAdmin)
  const dispatch = useDispatch()

  useEffect(() => {
    if (testSuccess) {
      track('TestConnectionSuccess')
    }
    if (testError) {
      track('TestConnectionError')
    }
  }
  , [testSuccess, testError])

  const saveButton = (
    <Button
      id='saveConnection'
      className={archiveBeforeSave ? styles.saveButton : undefined}
      type={tested && testSuccess ? 'primary' : 'default'} disabled={((!tested || !testSuccess || loading) && !saveWithoutTest) || !isAdmin} onClick={() => {
        track('SaveConnection')
        dispatch(saveConnection(id, connectionType, form.getFieldsValue()))
        form.resetFields()
      }}
    >
      Save
    </Button>
  )
  const archiveButton = (
    <Button
      className={styles.archiveButton}
      disabled={!id || !isAdmin}
      onClick={() => {
        track('ArchiveConnection', { connectionId: id })
        dispatch(archiveConnection(id))
      }}
    >
      Archive
    </Button>
  )

  return (
    <div className={styles.modalFooter}>
      <Button
        id='testConnection'
        type={primaryTest ? 'primary' : 'default'} disabled={testing || tested || testDisabled} loading={testing} onClick={() => {
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
      {archiveBeforeSave ? archiveButton : saveButton}
      {archiveBeforeSave ? saveButton : archiveButton}
    </div>
  )
}

function WherobotsConnectionModal ({ form }) {
  const { dialog } = useSelector(state => state.connection)
  const { id, loading } = dialog
  const dispatch = useDispatch()
  const connection = useSelector(state => state.connection.list.find(s => s.id === id))
  const datasetUsed = connection?.datasetCount > 0
  const apiKeyChanged = form.getFieldValue('wherobotsKey') !== connection?.wherobotsKey
  const wherobotsHint = useSelector(state => state.connection.wherobotsHint)

  useEffect(() => {
    if (!connection) {
      // new connection, set default values
      form.resetFields()
      form.setFieldsValue({
        connectionName: 'Wherobots',
        wherobotsHost: 'api.cloud.wherobots.com'
      })
    }
  }, [connection, form])

  return (
    <Modal
      open
      title={<><DatasourceIcon type={ConnectionType.CONNECTION_TYPE_WHEROBOTS} /> Wherobots</>}
      onCancel={() => dispatch(closeConnectionDialog())}
      footer={<Footer form={form} saveWithoutTest={!apiKeyChanged} testDisabled={!apiKeyChanged} />}
    >
      <div className={styles.modalBody}>
        <Form
          form={form}
          disabled={loading}
          layout='vertical' onValuesChange={(changedValues, allValues) => {
            if (connectionTestFieldsChanged(changedValues, ['connectionName', 'wherobotsHost', 'wherobotsKey', 'wherobotsRuntime', 'wherobotsRegion'])) {
              dispatch(connectionChanged())
            }
            if (changedValues.wherobotsHost || changedValues.wherobotsKey) {
              dispatch(getWherobotsConnectionHint(allValues.wherobotsHost, allValues.wherobotsKey))
            }
          }}
        >
          {datasetUsed ? <div className={styles.datasetsCountAlert}><Alert message={<>This connection is used in {connection.datasetCount} dataset{connection.datasetCount > 1 ? 's' : ''}.</>} description='Changing make cause report errors' type='warning' /></div> : null}
          <Form.Item required label='Connection Name' name='connectionName'>
            <Input defaultValue='Wherobots' />
          </Form.Item>
          <Form.Item required label='Host' name='wherobotsHost'>
            <Input />
          </Form.Item>
          <Form.Item required label='API Key' name='wherobotsKey' extra={<>The <a target='_blank' href='https://cloud.wherobots.com/organization/security' rel='noreferrer'>API key</a> for the user that you use to connect to the database.</>}>
            <Input.Password
              visibilityToggle={apiKeyChanged} onFocus={() => {
                if (!apiKeyChanged) {
                  form.setFieldsValue({ wherobotsKey: '' })
                }
              }} onBlur={() => {
                if (form.getFieldValue('wherobotsKey') === '') {
                  form.setFieldsValue({ wherobotsKey: connection?.wherobotsKey })
                }
              }}
            />
          </Form.Item>
          <Form.Item required label='Runtime' name='wherobotsRuntime'>
            <AutoComplete
              options={wherobotsHint.runtimes}
              showArrow
              disabled={false}
              filterOption={(inputValue, option) => option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1}
            />
          </Form.Item>
          <Form.Item required label='Region' name='wherobotsRegion'>
            <AutoComplete
              options={wherobotsHint.regions}
              showArrow
              disabled={false}
              filterOption={(inputValue, option) => option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1}
            />
          </Form.Item>
        </Form>
      </div>
    </Modal>
  )
}

function SnowflakeConnectionModal ({ form }) {
  const { dialog } = useSelector(state => state.connection)
  const { id, loading } = dialog
  const dispatch = useDispatch()
  const connection = useSelector(state => state.connection.list.find(s => s.id === id))
  const datasetUsed = connection?.datasetCount > 0
  const keyChanged = form.getFieldValue('snowflakeKey') !== connection?.snowflakeKey

  useEffect(() => {
    if (!connection) {
      // new connection, set default values
      form.resetFields()
      form.setFieldsValue({
        connectionName: 'Snowflake'
      })
    }
  }, [connection, form])

  return (
    <Modal
      open
      title={<><DatasourceIcon type={ConnectionType.CONNECTION_TYPE_SNOWFLAKE} /> Snowflake</>}
      onCancel={() => dispatch(closeConnectionDialog())}
      footer={<Footer form={form} saveWithoutTest={!keyChanged} testDisabled={!keyChanged} />}
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
            if (connectionTestFieldsChanged(changedValues, ['connectionName', 'snowflakeAccountId', 'snowflakeUsername', 'snowflakeKey', 'snowflakeWarehouse'])) {
              dispatch(connectionChanged())
            }
          }}
        >
          {datasetUsed ? <div className={styles.datasetsCountAlert}><Alert message={<>This connection is used in {connection.datasetCount} dataset{connection.datasetCount > 1 ? 's' : ''}.</>} description='Changing may cause map errors' type='warning' /></div> : null}
          <Form.Item label='Connection Name' name='connectionName'>
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
          <Form.Item required label='Snowflake Private Key' name='snowflakeKey' extra={<>The <a target='_blank' href='https://dekart.xyz/docs/usage/snowflake-private-key/' rel='noreferrer'>private key</a> required for authenticating with Snowflake.</>}>
            <Input.Password
              placeholder='MIIEv..' visibilityToggle={keyChanged} onFocus={() => {
                if (!keyChanged) {
                  form.setFieldsValue({ snowflakeKey: '' })
                }
              }} onBlur={() => {
                if (form.getFieldValue('snowflakeKey') === '') {
                  form.setFieldsValue({ snowflakeKey: connection?.snowflakeKey })
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

function PostgresConnectionModal ({ form }) {
  const { dialog } = useSelector(state => state.connection)
  const { id, loading } = dialog
  const isCloud = useSelector(state => state.env.isCloud)
  const dispatch = useDispatch()
  const connection = useSelector(state => state.connection.list.find(s => s.id === id))
  const datasetUsed = connection?.datasetCount > 0
  const postgresHost = Form.useWatch('postgresHost', form)
  const postgresUsername = Form.useWatch('postgresUsername', form)
  const postgresPassword = Form.useWatch('postgresPassword', form)
  const postgresDatabase = Form.useWatch('postgresDatabase', form)
  const postgresPort = Form.useWatch('postgresPort', form)
  const postgresSslMode = Form.useWatch('postgresSslMode', form)
  const passwordChanged = !connection || postgresPassword !== connection?.postgresPassword
  const connectionNeedsTest = !connection ||
    postgresHost !== connection?.postgresHost ||
    postgresUsername !== connection?.postgresUsername ||
    postgresPassword !== connection?.postgresPassword ||
    postgresDatabase !== connection?.postgresDatabase ||
    Number(postgresPort) !== Number(connection?.postgresPort) ||
    postgresSslMode !== connection?.postgresSslMode
  const passwordRequiredForTest = Boolean(connection && connectionNeedsTest && !passwordChanged)
  const sslModeOptions = isCloud
    ? [{ value: 'require', label: 'Require SSL' }]
    : [
        { value: 'disable', label: 'Disable SSL' },
        { value: 'require', label: 'Require SSL' }
      ]

  useEffect(() => {
    if (!connection) {
      form.resetFields()
      form.setFieldsValue({
        connectionName: 'Postgres',
        postgresPort: 5432,
        postgresSslMode: isCloud ? 'require' : 'disable'
      })
    }
  }, [connection, form, isCloud])

  return (
    <Modal
      open
      title={<><DatasourceIcon type={ConnectionType.CONNECTION_TYPE_POSTGRES} /> Postgres</>}
      onCancel={() => dispatch(closeConnectionDialog())}
      footer={<Footer form={form} saveWithoutTest={!connectionNeedsTest} testDisabled={!connectionNeedsTest || passwordRequiredForTest} archiveBeforeSave primaryTest={false} />}
    >
      <div className={styles.modalBody}>
        <Form
          form={form}
          disabled={loading}
          layout='vertical'
          requiredMark={false}
          onValuesChange={(changedValues) => {
            if (connectionTestFieldsChanged(changedValues, ['connectionName', 'postgresHost', 'postgresUsername', 'postgresPassword', 'postgresDatabase', 'postgresPort', 'postgresSslMode'])) {
              dispatch(connectionChanged())
            }
          }}
        >
          {datasetUsed ? <div className={styles.datasetsCountAlert}><Alert showIcon message={<>Used in {connection.datasetCount} dataset{connection.datasetCount > 1 ? 's' : ''} - changing this connection may cause map errors.</>} type='warning' /></div> : null}
          <Form.Item required label='Connection name' name='connectionName'>
            <Input placeholder='Postgres' />
          </Form.Item>
          <div className={styles.postgresFieldRow}>
            <Form.Item required label='Server' name='postgresHost' className={styles.postgresFieldWide}>
              <Input placeholder='db.example.com' />
            </Form.Item>
            <Form.Item required label='Port' name='postgresPort' className={styles.postgresFieldNarrow}>
              <Input type='number' placeholder='5432' />
            </Form.Item>
          </div>
          <div className={styles.postgresFieldRow}>
            <Form.Item required label='Username' name='postgresUsername' className={styles.postgresFieldWide}>
              <Input placeholder='postgres' />
            </Form.Item>
            <Form.Item required label='Password' name='postgresPassword' extra={passwordRequiredForTest ? 'Enter the password again to test connection changes.' : null} className={styles.postgresFieldNarrow}>
              <Input.Password
                placeholder='••••••••'
                visibilityToggle={passwordChanged}
                onFocus={() => {
                  if (!passwordChanged) {
                    form.setFieldsValue({ postgresPassword: '' })
                  }
                }}
                onBlur={() => {
                  if (form.getFieldValue('postgresPassword') === '') {
                    form.setFieldsValue({ postgresPassword: connection?.postgresPassword })
                  }
                }}
              />
            </Form.Item>
          </div>
          <Form.Item required label='Database' name='postgresDatabase' extra='Database your connection will use.'>
            <Input placeholder='postgres' />
          </Form.Item>
          <Form.Item required={isCloud} label='SSL mode' name='postgresSslMode' extra={isCloud ? <><LockOutlined /> Required on Dekart Cloud. Outbound connections must be encrypted.</> : "Optional for self-hosted Dekart. Match your server's SSL configuration."}>
            <Select options={sslModeOptions} disabled={isCloud} />
          </Form.Item>
          {isCloud
            ? (
              <div className={styles.postgresSetupHint}>
                <InfoCircleOutlined /> Allowlist Dekart Cloud egress IPs and use a read-only database user. <a href='https://dekart.xyz/docs/usage/postgres-connection/' target='_blank' rel='noreferrer'>Setup instructions</a>
              </div>
              )
            : null}
        </Form>
      </div>
    </Modal>
  )
}
function BigQueryServiceAccountConnectionModal ({ form }) {
  const { dialog, projects } = useSelector(state => state.connection)
  const { id, loading } = dialog
  const dispatch = useDispatch()
  const connection = useSelector(state => state.connection.list.find(s => s.id === id))
  const [showKey, setShowKey] = useState(!connection)

  useEffect(() => {
    track('BigQueryServiceAccountConnectionModal')
  }, [])

  // only name can be changed for connections used in datasets
  const nameChangeOnly = connection?.datasetCount > 0

  useEffect(() => {
    const bigqueryProjectId = form.getFieldValue('bigqueryProjectId')
    if (projects && projects.length === 1 && !bigqueryProjectId && !form.isFieldTouched('bigqueryProjectId')) {
      form.setFieldsValue({ bigqueryProjectId: projects[0] })
    }
  }, [projects, form])

  return (
    <Modal
      open
      title={<><DatasourceIcon type={ConnectionType.CONNECTION_TYPE_BIGQUERY} /> BigQuery Service Account</>}
      onCancel={() => dispatch(closeConnectionDialog())}
      footer={<Footer form={form} saveWithoutTest={!form.getFieldValue('newBigqueryKey')} testDisabled={!form.getFieldValue('newBigqueryKey')} />}
    >
      <div className={styles.modalBody}>
        <Form
          form={form}
          disabled={loading}
          layout='vertical' onValuesChange={(changedValues, allValues) => {
            if (connectionTestFieldsChanged(changedValues, ['connectionName', 'bigqueryProjectId', 'cloudStorageBucket', 'newBigqueryKey'])) {
              dispatch(connectionChanged())
            }
            if (changedValues.bigqueryProjectId && !allValues.connectionName) {
              form.setFieldsValue({ connectionName: changedValues.bigqueryProjectId })
            }
          }}
        >
          {nameChangeOnly ? <div className={styles.datasetsCountAlert}><Alert message={<>This connection is used in {connection.datasetCount} dataset{connection.datasetCount > 1 ? 's' : ''}.</>} description='Bucket name cannot be changed' type='warning' /></div> : null}
          <Form.Item label='Connection Name' name='connectionName'>
            <Input placeholder='BigQuery' />
          </Form.Item>
          <Form.Item
            required label='Service Account JSON Key' name='newBigqueryKey' extra={
              !showKey
                ? (
                  <>
                    Keys are encrypted and cannot be displayed.
                    <Button
                      type='link'
                      size='small'
                      onClick={() => {
                        track('ShowServiceAccountKeyField')
                        setShowKey(true)
                      }}
                    >
                      Enter new value
                    </Button>
                  </>
                  )
                : (
                  <>
                    Paste the JSON key for the service account you want to use to connect to BigQuery. <a href='https://dekart.xyz/docs/usage/choose-bigquery-connection-method/#how-to-get-a-service-account-key' target='_blank' rel='noreferrer'>Read Documentation</a>
                  </>
                  )
            }
          >
            <TextArea
              rows={4}
              disabled={!showKey}
              placeholder=''
            />
          </Form.Item>
          <Form.Item label='Optional: Storage Bucket' extra={<>Google Cloud Storage bucket to permanently cache query results. Required to share map with other users.</>} name='cloudStorageBucket'>
            <Input placeholder='my-gcs-bucket' disabled={nameChangeOnly} />
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
  useEffect(() => {
    track('BigQueryConnectionModal')
  }, [])

  useEffect(() => {
    if (!connection) {
      // new connection, set default values
      form.resetFields()
      form.setFieldsValue({
        connectionName: 'BigQuery'
      })
    }
  }, [connection, form])

  // only name can be changed for connections used in datasets
  const nameChangeOnly = connection?.datasetCount > 0

  const options = (projects || []).map(project => ({ value: project, label: project }))
  const bigqueryProjectId = form.getFieldValue('bigqueryProjectId')

  useEffect(() => {
    if (projects && projects.length === 1 && !bigqueryProjectId && !form.isFieldTouched('bigqueryProjectId')) {
      form.setFieldsValue({ bigqueryProjectId: projects[0] })
      track('AutoFillBigQueryProjectId')
    }
  }, [projects, bigqueryProjectId, form])

  useEffect(() => {
    if (!connection) {
      form.resetFields()
      form.setFieldsValue({
        connectionName: 'BigQuery'
      })
    }
  }, [id, form])

  return (
    <Modal
      open
      title={<><DatasourceIcon type={ConnectionType.CONNECTION_TYPE_BIGQUERY} /> BigQuery</>}
      onCancel={() => dispatch(closeConnectionDialog())}
      footer={<Footer form={form} saveWithoutTest={nameChangeOnly} />}
    >
      <div className={styles.modalBody}>
        <Form
          form={form}
          disabled={loading}
          layout='vertical' onValuesChange={(changedValues, allValues) => {
            if (connectionTestFieldsChanged(changedValues, ['connectionName', 'bigqueryProjectId', 'cloudStorageBucket'])) {
              dispatch(connectionChanged())
            }
          }}
        >
          {nameChangeOnly ? <div className={styles.datasetsCountAlert}><Alert message={<>This connection is used in {connection.datasetCount} dataset{connection.datasetCount > 1 ? 's' : ''}.</>} description='Only the name can be changed.' type='warning' /></div> : null}
          <Form.Item label='Connection Name' name='connectionName'>
            <Input />
          </Form.Item>
          <Form.Item
            label='Project ID' extra={(() => {
              if (projects) {
                return projects.length ? 'Click to select you BigQuery project ID' : <>→ <a target='_blank' href='https://dekart.xyz/docs/configuration/environment-variables/?ref=no-gcp-project#user-authorization-via-google-oauth-20-flow' rel='noreferrer'>Ensure your account has access to the Google Cloud Project</a></>
              }
              return <LoadingOutlined />
            })()} required name='bigqueryProjectId'
          >
            <AutoComplete
              options={options}
              showArrow
              placeholder={projects?.length ? '' : 'my-gcp-project'}
              disabled={nameChangeOnly}
              filterOption={(inputValue, option) => option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1}
            />
          </Form.Item>
          <Form.Item label='Optional: Storage Bucket' extra={<>Google Cloud Storage bucket to permanently cache query results. Required to share map with other users.</>} name='cloudStorageBucket'>
            <Input placeholder='my-gcs-bucket' disabled={nameChangeOnly} />
          </Form.Item>
        </Form>
      </div>
    </Modal>
  )
}

export default function ConnectionModal () {
  const { dialog } = useSelector(state => state.connection)
  const { visible, id, connectionType, bigqueryKey } = dialog
  const isCloud = useSelector(state => state.env.isCloud)
  const dispatch = useDispatch()

  useEffect(() => {
    dispatch(reOpenDialog())
  }, [dispatch])

  const connection = useSelector(state => state.connection.list.find(s => s.id === id))

  const [form] = Form.useForm()

  useEffect(() => {
    if (connection) {
      const formConnection = connectionType === ConnectionType.CONNECTION_TYPE_POSTGRES && isCloud && connection.postgresSslMode !== 'require'
        ? { ...connection, postgresSslMode: 'require' }
        : connection
      form.setFieldsValue(formConnection)
      if (formConnection !== connection) {
        dispatch(connectionChanged())
      }
    }
  }, [connection, connectionType, dispatch, form, isCloud])

  if (!visible) {
    return null
  }
  if (bigqueryKey) {
    return <BigQueryServiceAccountConnectionModal form={form} />
  }
  switch (connectionType) {
    case ConnectionType.CONNECTION_TYPE_POSTGRES:
      return <PostgresConnectionModal form={form} />
    case ConnectionType.CONNECTION_TYPE_SNOWFLAKE:
      return <SnowflakeConnectionModal form={form} />
    case ConnectionType.CONNECTION_TYPE_WHEROBOTS:
      return <WherobotsConnectionModal form={form} />
    case ConnectionType.CONNECTION_TYPE_BIGQUERY:
    default:
      return <BigQueryConnectionModal form={form} />
  }
}
