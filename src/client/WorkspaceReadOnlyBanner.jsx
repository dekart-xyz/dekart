import React from 'react'
import { AlertOutlined } from '@ant-design/icons'
import Button from 'antd/es/button'
import Text from 'antd/es/typography/Text'
import styles from './WorkspaceReadOnlyBanner.module.css'
import { useSelector } from 'react-redux'
import { useLocation, useHistory } from 'react-router-dom'
import { track } from './lib/tracking'
import { GetWorkspaceResponse } from 'dekart-proto/dekart_pb'

export default function WorkspaceReadOnlyBanner () {
  const readOnly = useSelector(state => state.workspace.readOnly)
  const readOnlyReason = useSelector(state => state.workspace.readOnlyReason)
  const isTrial = useSelector(state => state.user.isTrial)
  const location = useLocation()
  const history = useHistory()

  if (!readOnly || location.pathname === '/workspace/plan') {
    return null
  }
  const licenseExpired = readOnlyReason === GetWorkspaceResponse.ReadOnlyReason.READ_ONLY_REASON_LICENSE_KEY_EXPIRED
  const headline = licenseExpired
    ? 'License key expired'
    : isTrial
      ? 'Workspace is read-only — your trial has ended.'
      : 'Workspace is read-only — no active subscription.'
  const ctaLabel = licenseExpired ? 'Extend Key' : isTrial ? 'Upgrade Now' : 'Manage Subscription'

  return (
    <div className={styles.banner} role='status'>
      <div className={styles.message}>
        <AlertOutlined className={styles.icon} aria-hidden />
        <Text className={styles.headline}>
          {headline}
        </Text>
      </div>
      <div className={styles.actions}>
        <Button
          type='default'
          ghost
          {...(licenseExpired ? { href: 'https://calendly.com/vladi-dekart/30min', target: '_blank' } : {})}
          onClick={() => {
            track('WorkspaceReadOnlyBannerClick', { isTrial, ctaLabel, readOnlyReason })
            if (!licenseExpired) {
              history.push('/workspace/plan')
            }
          }}
        >
          {ctaLabel}
        </Button>
      </div>
    </div>
  )
}
