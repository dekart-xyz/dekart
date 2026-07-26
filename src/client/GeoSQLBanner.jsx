import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import Button from 'antd/es/button'
import { CloseOutlined, ThunderboltOutlined } from '@ant-design/icons'
import styles from './GeoSQLBanner.module.css'
import { updateLocalStorage } from './actions/localStorage'
import { updateSessionStorage } from './actions/sessionStorage'
import { track } from './lib/tracking'

const GEOSQL_URL = 'https://github.com/dekart-xyz/geosql#geosql'

// GeoSQLBanner promotes the agent workflow until it is dismissed or a device authorization exists.
export default function GeoSQLBanner ({ canShow }) {
  const dispatch = useDispatch()
  const email = useSelector(state => state.user.stream?.email)
  const dismissedByUser = useSelector(state => state.user.agentHintDismissedByUser)
  const shownByUser = useSelector(state => state.sessionStorage.current?.agentHintShownByUser || {})
  const { list, loading, initialized } = useSelector(state => state.deviceTokens)
  const dismissed = Boolean(email && dismissedByUser[email])
  const visible = Boolean(
    canShow &&
    email &&
    initialized &&
    !loading &&
    list.length === 0 &&
    !dismissed
  )

  useEffect(() => {
    // Track an impression once per user in this browser session.
    if (!visible || shownByUser[email]) {
      return
    }
    dispatch(updateSessionStorage('agentHintShownByUser', {
      ...shownByUser,
      [email]: true
    }))
    track('AgentHintShown')
  }, [dispatch, email, shownByUser, visible])

  if (!visible) {
    return null
  }

  return (
    <section
      id='dekart-geosql-banner'
      className={styles.banner}
      aria-label='AI agent SQL help'
    >
      <ThunderboltOutlined className={styles.sparkles} aria-hidden='true' />
      <span className={styles.message}>
        Claude and Codex can write this SQL.
      </span>
      <a
        id='dekart-geosql-banner-link'
        className={styles.link}
        href={GEOSQL_URL}
        target='_blank'
        rel='noopener noreferrer'
        onClick={() => track('AgentHintClicked')}
      >
        Show me
      </a>
      <Button
        id='dekart-geosql-banner-dismiss'
        className={styles.dismiss}
        type='text'
        icon={<CloseOutlined />}
        aria-label='Dismiss AI agent SQL help'
        onClick={() => {
          dispatch(updateLocalStorage('agentHintDismissedByUser', {
            ...dismissedByUser,
            [email]: true
          }))
          track('AgentHintDismissed')
        }}
      />
    </section>
  )
}
