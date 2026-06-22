import React, { useState } from 'react'
import Modal from 'antd/es/modal'
import Title from 'antd/es/typography/Title'
import Text from 'antd/es/typography/Text'
import Button from 'antd/es/button'
import Link from 'antd/es/typography/Link'
import { CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { useSelector, useDispatch } from 'react-redux'
import { useHistory } from 'react-router-dom/cjs/react-router-dom'
import { track } from './lib/tracking'
import { createSubscription } from './actions/workspace'
import { PlanType } from 'dekart-proto/dekart_pb'
import styles from './UpgradeModal.module.css'

export default function UpgradeModal ({ visible, onClose }) {
  const isSelfHosted = useSelector(state => state.user.isSelfHosted)
  const dispatch = useDispatch()
  const history = useHistory()
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

  // Send users who want to evaluate options to the full plans page.
  const handleComparePlans = () => {
    track('UpgradeModalComparePlans')
    onClose()
    history.push('/workspace/plan')
  }

  return (
    <Modal
      title={
        <div className={styles.header}>
          <span className={styles.infinityIcon} />
          <Title level={3} className={styles.title}>
            Get Unlimited Maps
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
            You&apos;ve reached 3 free maps
          </Title>
          <Title level={4} type='secondary' className={styles.description}>
            Get unlimited maps for 14 days free
          </Title>
        </div>

        <div className={styles.featuresBox}>
          <div className={styles.featuresHeader}>
            <Text strong className={styles.featuresTitle}>Here&apos;s what happens</Text>
          </div>
          <div className={styles.featuresList}>
            <div className={styles.feature}>
              <CheckCircleOutlined className={styles.checkIcon} />
              <Text>No credit card required</Text>
            </div>
            <div className={styles.feature}>
              <CheckCircleOutlined className={styles.checkIcon} />
              <Text>You&apos;re unblocked instantly to create maps</Text>
            </div>
            <div className={styles.feature}>
              <CheckCircleOutlined className={styles.checkIcon} />
              <Text>All maps you create will be available after trial ends</Text>
            </div>
            <div className={styles.feature}>
              <ClockCircleOutlined className={styles.clockIcon} />
              <Text>After 14 days, choose a plan to keep creating and editing maps</Text>
            </div>
          </div>
        </div>

        <Button
          type='primary'
          size='large'
          className={styles.startTrialButton}
          loading={loading}
          onClick={handleStartTrial}
        >
          Get unlimited maps
        </Button>

        <div className={styles.plansLink}>
          <Link onClick={handleComparePlans}>Compare plans</Link>
        </div>
      </div>
    </Modal>
  )
}
