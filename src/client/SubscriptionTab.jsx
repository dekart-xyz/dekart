import styles from './SubscriptionTab.module.css'
import Button from 'antd/es/button'
import { AlertOutlined } from '@ant-design/icons'
import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import { track } from './lib/tracking'
import Plans from './Plans'
import { Loading } from './Loading'

function TrialBanner () {
  const expired = useSelector(state => state.workspace.expired)
  const isTrial = useSelector(state => state.user.isTrial)
  const cancelAt = useSelector(state => state.workspace.subscription?.cancelAt)
  if (!expired || expired === null) {
    return null
  }

  let headline = ''
  let description = ''

  if (isTrial) {
    headline = 'Trial ended — workspace is paused.'
    description = 'Upgrade to resume creating maps and sharing with your team, or book a quick call to extend your trial free.'
  } else if (cancelAt > 0) {
    // Subscription Ended
    headline = 'Subscription Ended'
    description = 'Upgrade to resume creating maps and sharing with your team.'
  } else {
    // No active subscription (cancelAt = 0)
    headline = 'Checkout not completed'
    description = 'Your upgrade is still pending — finish your payment.'
  }

  return (
    <div className={styles.trialBanner}>
      <div className={styles.trialMessage}>
        <AlertOutlined className={styles.trialIcon} />
        <div>
          <div className={styles.trialHeadline}>{headline}</div>
          <div className={styles.trialDescription}>
            {description}
          </div>
        </div>
      </div>
      <div className={styles.trialActions}>
        <Button
          type='default'
      // className={styles.secondaryAction}
          href='https://calendly.com/vladi-dekart/30min'
          ghost
          target='_blank'
          rel='noreferrer'
        >
          Book a call
        </Button>
      </div>
    </div>
  )
}

export default function SubscriptionTab () {
  const userStream = useSelector(state => state.user.stream)
  const isSelfHosted = useSelector(state => state.user.isSelfHosted)
  const workspaceId = useSelector(state => state.workspace.id)
  useEffect(() => {
    if (userStream && !isSelfHosted) {
      track('SubscriptionTabOpened')
    }
  }, [userStream, isSelfHosted])
  if (!userStream) {
    return null
  }
  if (isSelfHosted) {
    return null
  }
  if (!workspaceId) {
    return <Loading verticalShift={100} />
  }
  return (
    <div className={styles.subscriptionTab}>
      <TrialBanner />
      <Plans />
      <div className={styles.termsLink}><a href='https://dekart.xyz/legal/terms/' target='_blank' rel='noreferrer'>🎓 Terms and conditions</a></div>
    </div>
  )
}
