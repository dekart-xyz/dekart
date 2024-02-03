import styles from './Header.module.css'
import { useSelector } from 'react-redux'
import DekartMenu from './DekartMenu'
import { getRef } from './lib/ref'
import Avatar from 'antd/es/avatar'
import Dropdown from 'antd/es/dropdown'
import { AuthState } from '../proto/dekart_pb'
import { authRedirect } from './lib/api'
import classNames from 'classnames'
import { useHistory } from 'react-router-dom/cjs/react-router-dom'

function getSignature (email) {
  if (!email) {
    return '?'
  }
  const parts = email.split('@')
  if (parts.length !== 2) {
    return '?'
  }
  const nameAr = parts[0].split('.')
  return nameAr.map(n => n[0]).join('')
}

function User ({ buttonDivider }) {
  const token = useSelector(state => state.token)
  const user = useSelector(state => state.user)
  const history = useHistory()
  if (!user || !token) {
    return null
  }
  return (
    <div className={classNames(
      styles.user,
      { [styles.buttonDivider]: buttonDivider }
    )}
    >
      <Dropdown
        overlayClassName={styles.userDropdown} menu={{
          items: [
            {
              label: user && user.email,
              disabled: true
            },
            {
              label: 'Manage workspace',
              onClick: () => {
                history.push('/workspace')
              }
            },
            {
              label: 'Switch account',
              onClick: () => {
                const state = new AuthState()
                state.setUiUrl(window.location.href)
                state.setAction(AuthState.Action.ACTION_REQUEST_CODE)
                state.setSwitchAccount(true)
                authRedirect(state)
              }
            },
            {
              label: 'Sign out',
              onClick: () => {
                const state = new AuthState()
                state.setUiUrl(window.location.href)
                state.setAction(AuthState.Action.ACTION_REVOKE)
                state.setAccessTokenToRevoke(token.access_token)
                authRedirect(state)
              }
            }
          ]
        }}
      ><Avatar>{getSignature(user && user.email)}</Avatar>
      </Dropdown>

    </div>
  )
}

export function Header ({ buttons, title }) {
  const env = useSelector(state => state.env)
  const usage = useSelector(state => state.usage)
  let homePage
  if (env.loaded && usage.loaded) {
    homePage = env.variables.UX_HOMEPAGE + '?ref=' + getRef(env, usage)
  }
  return (
    <div className={styles.header}>
      <div className={styles.top}>
        <DekartMenu />
        <div className={styles.middle}>
          <div className={styles.dekartLinkHolder}><a target='_blank' rel='noopener noreferrer' className={styles.dekartLink} href={homePage}>Dekart</a></div>
        </div>
        <div className={styles.buttons}>{buttons || null}</div>
        <User buttonDivider={Boolean(buttons)} />
      </div>
      {title ? (<div className={styles.title}>{title}</div>) : null}
    </div>
  )
}
