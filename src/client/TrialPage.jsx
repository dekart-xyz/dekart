import React, { useEffect, useRef, useState } from 'react'
import { Helmet } from 'react-helmet'
import Button from 'antd/es/button'
import { Redirect } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { PlanType } from 'dekart-proto/dekart_pb'
import { Header } from './Header'
import { Loading } from './Loading'
import PricingBlock from './PricingBlock'
import { createSubscription } from './actions/workspace'
import { track } from './lib/tracking'
import styles from './TrialPage.module.css'

const contactURL = 'https://calendly.com/vladi-dekart/meet-vladi'

// TrialPage acknowledges Cloud trial terms and starts the existing trial subscription flow.
export default function TrialPage () {
  const dispatch = useDispatch()
  const userStream = useSelector(state => state.user.stream)
  const isAdmin = useSelector(state => state.user.isAdmin)
  const isCloud = useSelector(state => state.env.isCloud)
  const workspace = useSelector(state => state.workspace)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const tracked = useRef(false)
  const starting = useRef(false)
  const isEligible = isCloud && userStream?.planType === PlanType.TYPE_PERSONAL
  const canonicalPlanType = workspace.subscription?.planType
  const revision = workspace.subscription?.revision

  useEffect(() => {
    // Track the acknowledgement only after the user stream establishes the viewer's role.
    if (!isEligible || tracked.current) return
    track('TrialAckShown', { role: isAdmin ? 'admin' : 'member' })
    tracked.current = true
  }, [isAdmin, isEligible])

  // The user stream is sufficient to render while workspace details load independently.
  if (!userStream) {
    return <Loading />
  }

  if (!isEligible || (canonicalPlanType && canonicalPlanType !== PlanType.TYPE_PERSONAL)) {
    return <Redirect to='/' push />
  }

  const startTrial = () => {
    // Prevent a rapid second click before React can render the loading state.
    if (starting.current || !revision) return
    starting.current = true
    setLoading(true)
    setError(null)
    track('StartTrialClicked')
    dispatch(createSubscription(PlanType.TYPE_TRIAL, err => {
      starting.current = false
      setLoading(false)
      if (err?.code === 10) return null
      // InvalidArgument indicates a workspace subscription state that requires support.
      if (err?.code === 3) {
        setError(<>We could not start the trial for this workspace. <a href={contactURL} target='_blank' rel='noreferrer'>Book a call</a> and we will help.</>)
      } else {
        setError('Could not start the trial. Please try again.')
      }
      return null
    }))
  }

  const title = isAdmin ? (workspace.id ? 'Your 14-day trial' : 'Start your 14-day trial') : 'Ask your workspace admin to start the trial'
  const subtitle = isAdmin
    ? 'Unlimited maps, editors, viewers and database connections.'
    : 'This workspace is on the free plan and is read-only until someone with admin access starts the 14-day trial.'

  return (
    <div className={styles.trialPage}>
      <Helmet><title>Start your trial - Dekart</title></Helmet>
      <Header />
      <div className={styles.body}>
        <main className={styles.content}>
          <h1>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
          {isAdmin
            ? (
              <div className={styles.action}>
                <div className={styles.error} aria-live='polite'>{error}</div>
                <Button id='dekart-start-trial' type='primary' size='large' loading={loading} disabled={!revision} onClick={startTrial}>Start 14-day trial</Button>
                <div className={styles.noCard}>No credit card required</div>
              </div>
              )
            : null}
          <div className={styles.afterTrial}>
            <p>When your trial ends, the workspace becomes read-only. Your maps stay viewable, and you can pay or book a call to keep editing.</p>
            <PricingBlock variant='trial' />
          </div>
        </main>
      </div>
    </div>
  )
}
