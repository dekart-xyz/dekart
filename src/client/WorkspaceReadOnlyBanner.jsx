import React from 'react'
import { AlertOutlined } from '@ant-design/icons'
import { Button, Typography } from 'antd'
import styles from './WorkspaceReadOnlyBanner.module.css'
import { useSelector } from 'react-redux'
import { useLocation } from 'react-router-dom'

export default function WorkspaceReadOnlyBanner () {
  const expired = useSelector(state => state.workspace.expired)
  const location = useLocation()

  if (!expired || location.pathname === '/workspace/plan') {
    return null
  }
  return (
    <div className={styles.banner} role='status'>
      <div className={styles.message}>
        <AlertOutlined className={styles.icon} aria-hidden />
        <Typography.Text className={styles.headline}>
          Workspace is read-only — your trial has ended.
        </Typography.Text>
      </div>
      <div className={styles.actions}>
        <Button
          type='default'
          ghost
          href='/workspace/plan'
        >
          Upgrade Now
        </Button>
      </div>
    </div>
  )
}
