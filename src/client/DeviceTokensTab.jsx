import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import Card from 'antd/es/card'
import Button from 'antd/es/button'
import Modal from 'antd/es/modal'
import Input from 'antd/es/input'
import Alert from 'antd/es/alert'
import Table from 'antd/es/table'
import copy from 'copy-to-clipboard'
import styles from './DeviceTokensTab.module.css'
import { createDeviceToken, revokeDeviceToken } from './actions/workspace'

const gisSkillRepoURL = 'https://github.com/dekart-xyz/geosql'

// Named tokens let users identify and revoke each connected client independently.
export default function DeviceTokensTab () {
  const dispatch = useDispatch()
  const devices = useSelector(state => state.deviceTokens.list)
  const loading = useSelector(state => state.deviceTokens.loading)
  const workspaceName = useSelector(state => state.workspace.name)
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('MCP Token')
  const [createdToken, setCreatedToken] = useState('')
  const [copied, setCopied] = useState(false)
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [revokeToken, setRevokeToken] = useState(null)

  return (
    <div className={styles.container}>
      <Card title='API tokens' loading={loading}>
        <div className={styles.introduction}>
          <p>
            Tokens let GeoSQL MCP clients, like Claude, query data in {workspaceName} on your
            behalf. Create one token per client so you can revoke them independently.
          </p>
          <Button
            type='primary'
            onClick={() => {
              setName('MCP Token')
              setCreateOpen(true)
            }}
          >
            Create token
          </Button>
        </div>
        {devices.length === 0
          ? (
            <div className={styles.empty}>
              <strong>No tokens yet</strong>
              <span>Create a token to connect Claude or another MCP client.</span>
            </div>
            )
          : (
            <Table
              className={styles.table}
              rowKey='id'
              dataSource={devices}
              pagination={false}
              scroll={{ x: 600 }}
              onRow={() => ({ 'data-testid': 'device-token-row' })}
              columns={[
                {
                  title: 'Name',
                  dataIndex: 'deviceName',
                  render: deviceName => (
                    <div className={styles.name}>
                      <strong>{deviceName}</strong>
                      <span>GeoSQL MCP</span>
                    </div>
                  )
                },
                {
                  title: 'Token',
                  dataIndex: 'tokenPreview',
                  render: preview => <span className={styles.preview}>{preview}</span>
                },
                { title: 'Created', dataIndex: 'createdAt', render: formatUnixDate },
                {
                  key: 'actions',
                  render: device => (
                    <Button type='link' danger onClick={() => setRevokeToken(device)}>
                      Revoke
                    </Button>
                  )
                }
              ]}
            />
            )}
      </Card>
      <Card title='Use with Claude'>
        <ol className={styles.instructions}>
          <li>Create a token above and copy it.</li>
          <li>
            <a href={gisSkillRepoURL} target='_blank' rel='noreferrer'>
              Install the Dekart Claude skill
            </a> to run agentic GIS queries.
          </li>
          <li>Paste the token when the skill asks for it.</li>
        </ol>
      </Card>
      <Modal
        title='Create GeoSQL MCP token'
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        okText='Create token'
        confirmLoading={creating}
        okButtonProps={{ disabled: !name.trim() }}
        onOk={async () => {
          setCreating(true)
          await dispatch(createDeviceToken(name.trim(), token => {
            setCreatedToken(token)
            setCopied(false)
            setCreateOpen(false)
          }))
          setCreating(false)
        }}
      >
        <label htmlFor='deviceTokenName'>Token name</label>
        <Input
          id='deviceTokenName'
          className={styles.nameInput}
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder='e.g. Claude Desktop – MacBook'
          maxLength={48}
        />
        <span className={styles.secondary}>Name it after the client or device that will use it.</span>
      </Modal>
      <Modal
        title={`Token created: ${name.trim()}`}
        open={Boolean(createdToken)}
        closable={false}
        maskClosable={false}
        keyboard={false}
        destroyOnClose
        width={560}
        footer={(
          <Button type={copied ? 'primary' : 'default'} onClick={() => setCreatedToken('')}>
            {copied ? 'Done' : 'Close without copying'}
          </Button>
        )}
      >
        <div className={styles.reveal}>
          <Alert type='warning' showIcon message='Copy this token now. You won’t be able to see it again.' />
          <div data-testid='created-device-token' className={styles.createdToken}>{createdToken}</div>
          <Button
            block
            type={copied ? 'default' : 'primary'}
            onClick={() => setCopied(copy(createdToken))}
          >
            {copied ? 'Copied to clipboard' : 'Copy token'}
          </Button>
          <span>
            Next: <a href={gisSkillRepoURL} target='_blank' rel='noreferrer'>install the Claude skill</a>
            {' '}and paste this token when prompted.
          </span>
        </div>
      </Modal>
      <Modal
        title='Revoke token?'
        open={Boolean(revokeToken)}
        onCancel={() => setRevokeToken(null)}
        okText='Revoke'
        okButtonProps={{ danger: true }}
        confirmLoading={revoking}
        onOk={async () => {
          setRevoking(true)
          // REVIEW: Close the confirmation only after successful removal and keep the button busy until the request finishes.
          await dispatch(revokeDeviceToken(revokeToken.id, () => setRevokeToken(null)))
          setRevoking(false)
        }}
      >
        Clients using <strong>{revokeToken?.deviceName}</strong> will lose access immediately.
        This cannot be undone.
      </Modal>
    </div>
  )
}

// Show the saved creation date in the same readable format for every client.
function formatUnixDate (seconds) {
  if (!seconds) return '—'
  return new Date(seconds * 1000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  })
}
