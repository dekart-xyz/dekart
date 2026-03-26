import React, { useEffect, useRef } from 'react'
import Modal from 'antd/es/modal'
import Button from 'antd/es/button'
import Title from 'antd/es/typography/Title'
import Text from 'antd/es/typography/Text'
import { LockOutlined } from '@ant-design/icons'
import { track } from './lib/tracking'
import styles from './SSOLoginModal.module.css'

export default function SSOLoginModal ({
  visible,
  onClose
}) {
  const wasVisible = useRef(false)
  const ssoTrialUrl = 'https://mailchi.mp/dekart/upgrade-to-sso'
  const ssoDocsUrl = 'https://dekart.xyz/docs/self-hosting/enable-sso-open-source-instance/'

  useEffect(() => {
    if (visible && !wasVisible.current) {
      track('SSOPopupOpened')
    }
    wasVisible.current = visible
  }, [visible])

  const closeModal = () => {
    track('SSOPopupClosed')
    onClose()
  }

  const openSSOTrialForm = () => {
    track('SSOPopupEnableSSOClicked')
    window.open(ssoTrialUrl, '_blank', 'noopener,noreferrer')
  }

  const openSSODocs = () => {
    track('SSOPopupSeeSetupDocsClicked')
    window.open(ssoDocsUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <Modal
      open={visible}
      title={null}
      footer={null}
      onCancel={closeModal}
      closable
      maskClosable
      width={480}
    >
      <div className={styles.modalContent}>
        <div className={styles.iconWrap}>
          <LockOutlined className={styles.icon} />
        </div>
        <Title level={4} className={styles.heading}>Login requires SSO</Title>
        <Text className={styles.body}>
          Dekart is running in anonymous mode. To enable login, teams, and shared maps, your instance admin needs to configure SSO.
        </Text>
        <Button type='primary' size='large' className={styles.primaryButton} onClick={openSSOTrialForm}>
          Enable SSO on your instance
        </Button>
        <Text type='secondary' className={styles.secondary}>
          Already have a license key? <a href={ssoDocsUrl} target='_blank' rel='noopener noreferrer' onClick={(e) => { e.preventDefault(); openSSODocs() }}>See setup docs {'\u2192'}</a>
        </Text>
      </div>
    </Modal>
  )
}
