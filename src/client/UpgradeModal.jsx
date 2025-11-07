import React, { useState } from 'react'
import { Modal, Typography, Button } from 'antd'
import { CrownOutlined, RocketOutlined, LockOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { useSelector, useDispatch } from 'react-redux'
import { track } from './lib/tracking'
import { createSubscription } from './actions/workspace'
import { PlanType } from 'dekart-proto/dekart_pb'
import styles from './UpgradeModal.module.css'

const { Title, Text } = Typography

const UpgradeModal = ({ visible, onClose }) => {
  const isSelfHosted = useSelector(state => state.user.isSelfHosted)
  const dispatch = useDispatch()
  const [loading, setLoading] = useState(false)

  // Don't show modal for self-hosted instances
  if (isSelfHosted) {
    return null
  }

  const handleClose = () => {
    track('UpgradeModalClosed')
    onClose()
  }

  const handleStartTrial = () => {
    track('StartTrialClicked')
    setLoading(true)
    dispatch(createSubscription(PlanType.TYPE_TRIAL))
  }

  return (
    <Modal
      title={
        <div className={styles.header}>
          <CrownOutlined className={styles.crownIcon} />
          <Title level={3} className={styles.title}>
            Start Your 14-Day Free Trial
          </Title>
        </div>
      }
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={600}
      className={styles.modal}
    >
      <div className={styles.content}>
        <div className={styles.limitMessage}>
          <Title level={2} className={styles.mainTitle}>
            Go beyond your first shared map!
          </Title>
          <Title level={4} type='secondary' className={styles.description}>
            Share more maps, track your viewers, and collect leads.
          </Title>
        </div>

        <div className={styles.featuresBox}>
          <div className={styles.featuresHeader}>
            <LockOutlined className={styles.lockIcon} />
            <Text strong className={styles.featuresTitle}>What you'll unlock instantly:</Text>
          </div>
          <div className={styles.featuresList}>
            <div className={styles.feature}>
              <CheckCircleOutlined className={styles.checkIcon} />
              <Text>Unlimited public & shared maps</Text>
            </div>
            <div className={styles.feature}>
              <CheckCircleOutlined className={styles.checkIcon} />
              <Text>Team invites & role management</Text>
            </div>
            <div className={styles.feature}>
              <CheckCircleOutlined className={styles.checkIcon} />
              <Text>Viewer analytics + lead capture</Text>
            </div>
          </div>
        </div>

        <Button
          type='primary'
          size='large'
          icon={<RocketOutlined />}
          className={styles.startTrialButton}
          loading={loading}
          onClick={handleStartTrial}
        >
          Start Free Trial
        </Button>

        <div className={styles.disclaimers}>
          <Text type='secondary' className={styles.disclaimerText}>
            No commitment — 14 days full access, then choose to upgrade or stop.
          </Text>
          <Text type='secondary' className={styles.disclaimerText}>
            No credit card required.
          </Text>
        </div>
      </div>
    </Modal>
  )
}

export default UpgradeModal
