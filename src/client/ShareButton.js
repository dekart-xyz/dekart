import Button from 'antd/es/button'
import Modal from 'antd/es/modal'
import { EditOutlined, UsergroupAddOutlined, LinkOutlined, LockOutlined, InfoCircleOutlined, FileSearchOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import styles from './ShareButton.module.css'
import { useDispatch, useSelector } from 'react-redux'
import Tooltip from 'antd/es/tooltip'
import { getRef } from './lib/ref'
import Switch from 'antd/es/switch'
import { copyUrlToClipboard } from './actions/clipboard'
import { setDiscoverable } from './actions/report'

function CopyLinkButton () {
  const dispatch = useDispatch()
  return (
    <Button
      icon={<LinkOutlined />}
      title='Copy link to report'
      onClick={() => dispatch(copyUrlToClipboard(window.location.toString()))}
    >Copy Link
    </Button>
  )
}

function AuthTypeTitle ({ authType, referer }) {
  const { anchor, title } = {
    AMAZON_OIDC: { anchor: 'user-authorization-via-amazon-load-balancer', title: 'Amazon OIDC' },
    IAP: { anchor: 'user-authorization-via-google-iap', title: 'Google IAP' },
    GOOGLE_OAUTH: { anchor: '', title: 'Google OAuth 2.0 flow' }
  }[authType]
  return (
    <><span>Users authorized via </span>
      <a
        target='_blank' href={`https://dekart.xyz/docs/configuration/environment-variables/?ref=${referer}#${anchor}`} rel='noreferrer'
      >{title}
      </a> header
    </>
  )
}

function ModalContent ({ reportId, discoverable, isAuthor, allowEdit }) {
  const env = useSelector(state => state.env)
  const usage = useSelector(state => state.usage)
  const { loaded: envLoaded, authEnabled, authType } = env
  const dispatch = useDispatch()
  const [discoverableSwitch, setDiscoverableSwitch] = useState(discoverable)
  const [allowEditSwitch, setAllowEditSwitch] = useState(allowEdit)

  // when changed by another user, reset state
  useEffect(() => {
    setDiscoverableSwitch(discoverable)
  }, [discoverable])
  useEffect(() => {
    setAllowEditSwitch(allowEdit)
  }, [allowEdit])

  if (!envLoaded) {
    return null
  }

  if (authEnabled) {
    return (
      <>
        <div className={styles.reportStatus}>
          <div className={styles.reportStatusIcon}><LockOutlined /></div>
          <div className={styles.reportStatusDetails}>
            <div className={styles.reportStatusDetailsText}>{(() => {
              switch (true) {
                case discoverable && allowEdit:
                  return 'Everyone can view and edit report'
                case !discoverable && allowEdit:
                  return 'Everyone with link can edit report'
                case discoverable && !allowEdit:
                  return 'Everyone with link can view and refresh report'
                default:
                  return 'Everyone with a link can view report'
              }
            })()}
            </div>
            <div className={styles.reportAuthStatus}>
              <Tooltip title={<AuthTypeTitle authType={authType} referer={getRef(env, usage)} />}>
                <span className={styles.authEnabled}>User authorization enabled</span>
              </Tooltip>
            </div>
          </div>
        </div>
        <div className={styles.boolStatus}>
          <div className={styles.boolStatusIcon}><FileSearchOutlined /></div>
          <div className={styles.boolStatusLabel}>Allow everyone to discover and refresh report</div>
          <div className={styles.boolStatusControl}>
            <Switch
              checked={discoverable}
              disabled={!isAuthor}
              title={!isAuthor ? 'Only the author can change this setting' : undefined}
              onChange={(checked) => {
                setDiscoverableSwitch(checked)
                dispatch(setDiscoverable(reportId, checked, allowEdit))
              }}
              loading={discoverableSwitch !== discoverable}
            />
          </div>
        </div>
        <div className={styles.boolStatus}>
          <div className={styles.boolStatusIcon}><EditOutlined /></div>
          <div className={styles.boolStatusLabel}>Allow everyone to edit the report</div>
          <div className={styles.boolStatusControl}>
            <Switch
              checked={allowEdit}
              disabled={!isAuthor}
              title={!isAuthor ? 'Only the author can change this setting' : undefined}
              onChange={(checked) => {
                setAllowEditSwitch(checked)
                dispatch(setDiscoverable(reportId, discoverable, checked))
              }}
              loading={allowEditSwitch !== allowEdit}
            />
          </div>
        </div>
      </>
    )
  }

  return (
    <div className={styles.reportStatus}>
      <div className={styles.reportStatusIcon}><InfoCircleOutlined /></div>
      <div className={styles.reportStatusDetails}>
        <div className={styles.reportStatusDetailsText}>Everyone can edit report</div>
      </div>
    </div>
  )
}

export default function ShareButton ({ reportId, discoverable, isAuthor, allowEdit }) {
  const [modalOpen, setModalOpen] = useState(false)
  return (
    <>
      <Button
        icon={<UsergroupAddOutlined />}
        ghost
        type='text'
        title='Share and export'
        onClick={() => setModalOpen(true)}
      />
      <Modal
        title='Share report'
        visible={modalOpen}
        onOk={() => setModalOpen(false)}
        onCancel={() => setModalOpen(false)}
        bodyStyle={{ padding: '0px' }}
        footer={
          <div className={styles.modalFooter}>
            <CopyLinkButton />
            <div className={styles.modalFooterSpacer} />
            <Button type='primary' onClick={() => setModalOpen(false)}>
              Done
            </Button>
          </div>
      }
      >
        <ModalContent reportId={reportId} discoverable={discoverable} isAuthor={isAuthor} allowEdit={allowEdit} />
      </Modal>
    </>
  )
}
