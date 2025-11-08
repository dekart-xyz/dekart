import React from 'react'
import { AlertOutlined } from '@ant-design/icons'
import { Button, Typography } from 'antd'
import styles from './WorkspaceReadOnlyBanner.module.css'

export default function WorkspaceReadOnlyBanner () {
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
