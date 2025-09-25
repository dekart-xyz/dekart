import styles from './SubscriptionTab.module.css'
import Title from 'antd/es/typography/Title'
import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import { track } from './lib/tracking'
import Plans from './Plans'

export default function SubscriptionTab () {
  const userStream = useSelector(state => state.user.stream)
  const isSelfHosted = useSelector(state => state.user.isSelfHosted)
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
  return (
    <div className={styles.subscriptionTab}>
      <Plans />
      <div className={styles.termsLink}><a href='https://dekart.xyz/legal/terms/' target='_blank' rel='noreferrer'>🎓 Terms and conditions</a></div>
      <div className={styles.notSure}>
        <Title level={2}>Not sure what plan to choose?</Title>
        <p><a href='https://calendly.com/vladi-dekart/30min' target='_blank' rel='noreferrer'>Book a call with the Dekart team</a> — Unlock insider discounts and learn about our roadmap.</p>
      </div>
    </div>
  )
}
