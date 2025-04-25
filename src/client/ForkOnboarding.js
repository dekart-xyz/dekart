import Button from 'antd/es/button'
import Tooltip from 'antd/es/tooltip'
import { useDispatch, useSelector } from 'react-redux'
import { useHistory } from 'react-router-dom/cjs/react-router-dom'
import { getDatasourceMeta } from './lib/datasource'
import { useState, useEffect } from 'react'
import Modal from 'antd/es/modal'
import Steps from 'antd/es/steps'
import styles from './ForkOnboarding.module.css'
import { updateSessionStorage } from './actions/sessionStorage'
import { ForkOutlined } from '@ant-design/icons'
import { track } from './lib/tracking'
import { ConnectionType } from '../proto/dekart_pb'

export function useRequireOnboarding () {
  const userDefinedConnection = useSelector(state => state.connection.userDefined)
  const userStream = useSelector(state => state.user.stream)
  const workspaceId = userStream?.workspaceId
  const requireWorkspace = !workspaceId
  const { canWrite } = useSelector(state => state.report)
  const connections = useSelector(state => state.connection.list)
  const connectionListLoaded = useSelector(state => state.connection.listLoaded) || userStream?.planType === 0
  const connectionTypesRequired = useSelector(state => state.dataset.list.reduce((acc, dataset) => {
    const connectionType = dataset.connectionType === ConnectionType.CONNECTION_TYPE_UNSPECIFIED ? ConnectionType.CONNECTION_TYPE_BIGQUERY : dataset.connectionType
    if (!acc.includes(connectionType)) {
      return acc.concat(connectionType)
    }
    return acc
  }
  , []))
  if (!userStream || !connectionListLoaded || canWrite || !userDefinedConnection) {
    return null
  }
  const connectionTypes = connections.reduce((acc, connection) => {
    const connectionType = connection.connectionType === ConnectionType.CONNECTION_TYPE_UNSPECIFIED ? ConnectionType.CONNECTION_TYPE_BIGQUERY : connection.connectionType
    if (!acc.includes(connectionType)) {
      return acc.concat(connectionType)
    }
    return acc
  }
  , [])
  const alreadyConnectedTypes = connectionTypesRequired.filter(connectionType => connectionTypes.includes(connectionType))
  // find missing connection types
  const missingConnectionTypes = connectionTypesRequired.filter(connectionType => !connectionTypes.includes(connectionType))
  if (requireWorkspace || missingConnectionTypes.length) {
    return {
      requireWorkspace,
      missingConnectionTypes,
      alreadyConnectedTypes
    }
  }
  return null
}

export function ForkOnboarding ({ requireOnboarding: { requireWorkspace, missingConnectionTypes, alreadyConnectedTypes }, edit }) {
  const [visible, setVisible] = useState(false)
  const dispatch = useDispatch()
  const current = requireWorkspace ? 0 : 1 + alreadyConnectedTypes.length
  const reportId = useSelector(state => state.report.id)
  const history = useHistory()
  const button = requireWorkspace
    ? (
      <Button
        type='primary' onClick={() => {
          track('CreateWorkspaceFromForkOnboarding')
          history.push('/workspace')
        }}
      >Create Free Workspace
      </Button>
      )
    : <Button type='primary' onClick={() => history.push('/connections')}>Connect {getDatasourceMeta(missingConnectionTypes[0]).name}</Button>

  useEffect(() => {
    track('ForkOnboarding')
  }, [])
  return (
    <>
      <Tooltip title='Copy and edit this map in your Dekart Workspace.'>
        <Button
          type='primary' icon={<ForkOutlined />} onClick={() => {
            setVisible(true)
            dispatch(updateSessionStorage('redirectWhenSaveConnection', { reportId, edit }))
            track('ForkOnboardingStart')
          }}
        >Fork This Map
        </Button>
      </Tooltip>
      <Modal
        width={600}
        open={visible}
        title='Fork This Map'
        onCancel={() => setVisible(false)}
        footer={<div className={styles.modalFooter}>{button}</div>}
      ><p className={styles.description}>Create your own copy of this map by setting up a workspace, connecting your data, and forking it to use with your own queries.</p>
        <Steps
          size='small'
          current={current}
          items={[
            {
              title: 'Create Workspace',
              description: '10 seconds'
            }
          ].concat(alreadyConnectedTypes.concat(missingConnectionTypes).map(getDatasourceMeta).map(({ name, style, usageStatsId }) => ({
            title: `Connect ${name}`,
            description: '15 seconds'
          }))).concat({
            title: 'Fork Map',
            description: '5 seconds'
          })}
        />
      </Modal>
    </>
  )
}
