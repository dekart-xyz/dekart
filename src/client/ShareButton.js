import Button from 'antd/es/button'
import Modal from 'antd/es/modal'
import { UsergroupAddOutlined, LinkOutlined, LockOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { useState } from 'react'
import styles from './ShareButton.module.css'
import { copyUrlToClipboard } from './actions'
import { useDispatch, useSelector } from 'react-redux'
import Tooltip from 'antd/es/tooltip'
import { getRef } from './lib/ref'

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

const ref = getRef()

function AuthTypeTitle ({ authType }) {
  const { anchor, title } = {
    AMAZON_OIDC: { anchor: 'user-authorization-via-amazon-load-balancer', title: 'Amazon OIDC' },
    IAP: { anchor: 'user-authorization-via-google-iap', title: 'Google IAP' }
  }[authType]
  return (
    <><span>Users authorized via </span>
      <a
        target='_blank' href={`https://dekart.xyz/docs/configuration/environment-variables/?ref=${ref}#${anchor}`} rel='noreferrer'
      >{title}
      </a> header
    </>
  )
}

export default function ShareButton () {
  const [modalOpen, setModalOpen] = useState(false)
  const env = useSelector(state => state.env)
  const { REQUIRE_AMAZON_OIDC, REQUIRE_IAP } = env.variables
  const authEnabled = REQUIRE_AMAZON_OIDC === '1' || REQUIRE_IAP === '1'

  if (!env.loaded) {
    return null
  }

  return (
    <>
      <Button
        type='primary'
        icon={<UsergroupAddOutlined />}
        onClick={() => setModalOpen(true)}
      >Share
      </Button>
      <Modal
        title='Share report'
        visible={modalOpen}
        onOk={() => setModalOpen(false)}
        onCancel={() => setModalOpen(false)}
        bodyStyle={{ padding: '0px' }}
        footer={
          <div className={styles.modalFooter}>
            <CopyLinkButton />
            <Button type='primary' onClick={() => setModalOpen(false)}>
              Done
            </Button>
          </div>
      }
      >
        <div className={styles.reportStatus}>
          {
                authEnabled
                  ? (
                    <><div className={styles.reportStatusIcon}><LockOutlined /></div>
                      <div className={styles.reportStatusDetails}>
                        <div className={styles.reportStatusDetailsText}> Everyone with a link and access to <span className={styles.origin}>{window.location.hostname}</span> can view this report</div>
                        <div className={styles.reportAuthStatus}>
                          <Tooltip title={<AuthTypeTitle authType={REQUIRE_IAP === '1' ? 'IAP' : 'AMAZON_OIDC'} />}>
                            <span className={styles.authEnabled}>User authorization enabled</span>
                          </Tooltip>
                        </div>
                      </div>
                    </>
                    )
                  : (
                    <><div className={styles.reportStatusIcon}><InfoCircleOutlined /></div>
                      <div className={styles.reportStatusDetails}>
                        <div className={styles.reportStatusDetailsText}> Everyone with access to <span className={styles.origin}>{window.location.hostname}</span> can edit this report</div>
                      </div>
                    </>)
                  }
        </div>
      </Modal>
    </>
  )
}
