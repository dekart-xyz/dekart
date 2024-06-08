import Button from 'antd/es/button'
import Modal from 'antd/es/modal'
import { GlobalOutlined, EditOutlined, UsergroupAddOutlined, LinkOutlined, LockOutlined, FileSearchOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import styles from './ShareButton.module.css'
import { useDispatch, useSelector } from 'react-redux'
import Switch from 'antd/es/switch'
import { copyUrlToClipboard } from './actions/clipboard'
import { setDiscoverable } from './actions/report'
import { PlanType } from '../proto/dekart_pb'
import Tooltip from 'antd/es/tooltip'
import { getUrlRef } from './lib/ref'

function CopyLinkButton () {
  const dispatch = useDispatch()
  const userStream = useSelector(state => state.user.stream)
  const playgroundReport = useSelector(state => state.report.isPlayground)
  const isSharable = useSelector(state => state.report.isSharable)
  return (
    <Button
      icon={<LinkOutlined />}
      disabled={((userStream.planType === PlanType.TYPE_PERSONAL) && !playgroundReport) || !isSharable}
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

function ModalContent () {
  const dispatch = useDispatch()
  const { discoverable, allowEdit, isAuthor, id: reportId, isSharable } = useSelector(state => state.report)
  const [discoverableSwitch, setDiscoverableSwitch] = useState(discoverable)
  const workspaceName = useSelector(state => state.workspace.name)
  const env = useSelector(state => state.env)
  const usage = useSelector(state => state.usage)
  const userStream = useSelector(state => state.user.stream)
  const playgroundReport = useSelector(state => state.report.isPlayground)
  const { loaded: envLoaded, authType } = env
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

  return (
    <>
      <div className={styles.reportStatus}>
        {playgroundReport
          ? (
            <>
              <div className={styles.reportStatusIcon}><GlobalOutlined /></div>
              <div className={styles.reportStatusDetails}>
                <div className={styles.reportStatusDetailsText}> Everyone can see this report</div>
                <div className={styles.playgroundReportText}>This report was created in Playground Mode</div>
              </div>
            </>
            )
          : (
            <>
              <div className={styles.reportStatusIcon}><LockOutlined /></div>
              {(() => {
                switch (true) {
                  case (userStream.planType === PlanType.TYPE_PERSONAL): {
                    return (
                      <div className={styles.reportStatusDetails}>
                        <div className={styles.reportStatusDetailsText}> Only you can access workspace</div>
                        <div className={styles.manageSubscription}><a href='/workspace' target='_blank'>Add users to workspace</a></div>
                      </div>

                    ) }
                  case (!isSharable): {
                    return (
                      <div className={styles.reportStatusDetails}>
                        <div className={styles.reportStatusDetailsText}> Only you can access report</div>
                        <div className={styles.addBucketToConnection}>To share reports between workspace users, please use connection with storage bucket.</div>
                        <div><a href='/connections'>Setup connection</a></div>
                      </div>

                    ) }
                  default:
                    return (
                      <div className={styles.reportStatusDetails}>
                        <div className={styles.reportStatusDetailsText}>{(() => {
                          switch (true) {
                            case !isSharable:
                              return <>Only you can view and refresh report</>
                            case discoverable && allowEdit:
                              return <>Everyone with access to <span className={styles.origin}>{workspaceName}</span> workspace can view and edit report</>
                            case !discoverable && allowEdit:
                              return <>Everyone with a link and access to <span className={styles.origin}>{workspaceName}</span> workspace can view and edit report</>
                            case discoverable && !allowEdit:
                              return <>Everyone with access to <span className={styles.origin}>{workspaceName}</span> workspace can view and refresh report</>
                            default:
                              return <>Everyone with a link and access to <span className={styles.origin}>{workspaceName}</span> workspace can view report</>
                          }
                        })()}
                        </div>
                        <div className={styles.reportAuthStatus}>
                          <Tooltip title={<AuthTypeTitle authType={authType} referer={getUrlRef(env, usage)} />}>
                            <span className={styles.authEnabled}>User authorization enabled</span>
                          </Tooltip>
                        </div>
                      </div>
                    )
                }
              })()}

            </>
            )}
      </div>
      {userStream.planType === PlanType.TYPE_TEAM && isSharable
        ? (
          <>
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
        : null}
    </>
  )
}

export default function ShareButton () {
  const [modalOpen, setModalOpen] = useState(false)
  return (
    <>
      <Button
        icon={<UsergroupAddOutlined />}
        ghost
        type='text'
        title='Share report'
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
        <ModalContent />
      </Modal>
    </>
  )
}
