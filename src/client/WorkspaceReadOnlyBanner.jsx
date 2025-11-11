import React from 'react'
import { AlertOutlined } from '@ant-design/icons'
import { Button, Typography } from 'antd'
import styles from './WorkspaceReadOnlyBanner.module.css'
import { useSelector } from 'react-redux'
import { useLocation, useHistory } from 'react-router-dom'

export default function WorkspaceReadOnlyBanner () {
  const expired = useSelector(state => state.workspace.expired)
  const isTrial = useSelector(state => state.user.isTrial)
  const location = useLocation()
  const history = useHistory()

  if (!expired || location.pathname === '/workspace/plan') {
    return null
  }
  const headline = isTrial
    ? 'Workspace is read-only — your trial has ended.'
    : 'Workspace is read-only — no active subscription.'
  const ctaLabel = isTrial ? 'Upgrade Now' : 'Manage Subscription'

  return (
    <div className={styles.banner} role='status'>
      <div className={styles.message}>
        <AlertOutlined className={styles.icon} aria-hidden />
        <Typography.Text className={styles.headline}>
          {headline}
        </Typography.Text>
      </div>
      <div className={styles.actions}>
        <Button
          type='default'
          ghost
          onClick={() => history.push('/workspace/plan')}
        >
          {ctaLabel}
        </Button>
      </div>
    </div>
  )
}
