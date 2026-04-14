import { useMemo, useState } from 'react'
import Card from 'antd/es/card'
import Button from 'antd/es/button'
import Empty from 'antd/es/empty'
import Typography from 'antd/es/typography'
import styles from './DeviceTokensTab.module.css'

const { Text } = Typography
const gisSkillRepoURL = 'https://github.com/dekart-xyz/gis-skill'

function buildMockDevices () {
  return [
    {
      id: 'dev_1',
      name: 'Vladi MacBook Pro',
      activeSince: '2026-04-07',
      tokenPreview: 'dtk_live_7f3a...91c2'
    },
    {
      id: 'dev_2',
      name: 'CI Runner (GitHub Actions)',
      activeSince: '2026-04-10',
      tokenPreview: 'dtk_live_1a9d...6b8f'
    },
    {
      id: 'dev_3',
      name: 'Local Linux VM',
      activeSince: '2026-04-12',
      tokenPreview: 'dtk_live_43ce...02ad'
    }
  ]
}

function AgentLink () {
  return (
    <div className={styles.agentLink}>
      <a href={gisSkillRepoURL} target='_blank' rel='noreferrer'>
        Connect AI Agent to Dekart
      </a>
    </div>
  )
}

// DeviceTokensTab renders mocked workspace device tokens and local revoke interactions.
export default function DeviceTokensTab () {
  const [devices, setDevices] = useState(buildMockDevices())
  const [confirmingId, setConfirmingId] = useState('')

  const isEmpty = useMemo(() => devices.length === 0, [devices.length])

  if (isEmpty) {
    return (
      <div className={styles.container}>
        <Card className={styles.wrapper}>
          <Empty description='No active device tokens' />
        </Card>
        <AgentLink />
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <Card className={styles.wrapper}>
        <div className={styles.list}>
          {devices.map((device) => (
            <div key={device.id} className={styles.item}>
              <div className={styles.nameColumn}>
                <Text strong className={styles.deviceName}>{device.name}</Text>
              </div>
              <div className={styles.detailsColumn}>
                <div className={styles.metaItem}>
                  <Text type='secondary'>Token</Text>
                  <Text code>{device.tokenPreview}</Text>
                </div>
                <div className={styles.metaItem}>
                  <Text type='secondary'>Since</Text>
                  <Text>{device.activeSince}</Text>
                </div>
              </div>
              <div className={styles.actions}>
                {confirmingId === device.id
                  ? (
                    <Button
                      danger
                      type='text'
                      className={styles.removeButton}
                      onClick={() => {
                        // why: prototype keeps revoke behavior local-only until backend is connected.
                        setDevices((current) => current.filter((entry) => entry.id !== device.id))
                        setConfirmingId('')
                      }}
                    >
                      Confirm
                    </Button>
                    )
                  : (
                    <Button
                      type='text'
                      className={styles.removeButton}
                      onClick={() => setConfirmingId(device.id)}
                    >
                      Remove
                    </Button>
                    )}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <AgentLink />
    </div>
  )
}
