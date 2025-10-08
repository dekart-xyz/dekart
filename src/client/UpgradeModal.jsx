import React from 'react'
import { Modal, Typography, Divider } from 'antd'
import { CrownOutlined } from '@ant-design/icons'
import { useSelector } from 'react-redux'
import { track } from './lib/tracking'
import styles from './UpgradeModal.module.css'
import Plans from './Plans'

const { Title } = Typography

const UpgradeModal = ({ visible, onClose }) => {
  const isSelfHosted = useSelector(state => state.user.isSelfHosted)

  // Don't show modal for self-hosted instances
  if (isSelfHosted) {
    return null
  }

  const handleClose = () => {
    track('UpgradeModalClosed')
    onClose()
  }

  return (
    <Modal
      title={
        <div className={styles.header}>
          <CrownOutlined className={styles.crownIcon} />
          <Title level={3} className={styles.title}>
            Upgrade Your Plan
          </Title>
        </div>
      }
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={1000}
      className={styles.modal}
    >
      <div className={styles.content}>
        <div className={styles.limitMessage}>
          <Title level={2} className={styles.title}>
            Go beyond first shared map!
          </Title>
          <Title level={4} type='secondary' className={styles.description}>
            Upgrade to share more maps, track your viewers, and collect leads.
          </Title>
        </div>

        <Divider />

        <Plans />
      </div>
    </Modal>
  )
}

export default UpgradeModal
