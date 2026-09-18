import React from 'react'
import Button from 'antd/es/button'
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

  // Device authorization finishes before Personal workspaces continue to the trial screen.
  if (!readOnly || ['/workspace/plan', '/workspace/trial', '/device/authorize'].includes(location.pathname)) {
    return null
  }
  const licenseExpired = readOnlyReason === GetWorkspaceResponse.ReadOnlyReason.READ_ONLY_REASON_LICENSE_KEY_EXPIRED
  const trialNotStarted = readOnlyReason === GetWorkspaceResponse.ReadOnlyReason.READ_ONLY_REASON_TRIAL_NOT_STARTED
  const trialExpired = readOnlyReason === GetWorkspaceResponse.ReadOnlyReason.READ_ONLY_REASON_SUBSCRIPTION_EXPIRED && isTrial
  const ctaLabel = trialNotStarted ? 'Start 14-day trial' : trialExpired ? 'Book a call' : licenseExpired ? 'Extend Key' : 'Manage Subscription'
  const headline = trialNotStarted
    ? 'Start your trial to use this workspace.'
    : licenseExpired
      ? 'License key expired'
      : trialExpired
        ? 'Workspace is read-only.'
        : 'Workspace is read-only — no active subscription.'
  const detail = trialNotStarted
    ? 'Your maps stay viewable until you do.'
    : trialExpired
      ? 'Your trial has ended. Your maps stay viewable.'
      : ''

  const trackClick = (ctaLabel) => track('WorkspaceReadOnlyBannerClick', { isTrial, ctaLabel, readOnlyReason })

  return (
    <div className={styles.banner} role='status'>
      <div className={styles.message}>
        <div className={styles.headline}>{headline}</div>
        {detail ? <div className={styles.detail}>{detail}</div> : null}
      </div>
      <div className={styles.actions}>
        {(trialExpired || trialNotStarted) && (
          <Button
            type='link'
            className={styles.secondaryAction}
            onClick={() => {
              trackClick('See plans')
              history.push('/workspace/plan')
            }}
          >See plans
          </Button>
        )}
        <Button
          ghost
          {...(trialExpired || licenseExpired ? { href: 'https://calendly.com/vladi-dekart/meet-vladi', target: '_blank', rel: 'noreferrer' } : {})}
          onClick={() => {
            trackClick(ctaLabel)
            if (!trialExpired && !licenseExpired) history.push(trialNotStarted ? '/workspace/trial' : '/workspace/plan')
          }}
        >{ctaLabel}
        </Button>
      </div>
    </div>
  )
}
