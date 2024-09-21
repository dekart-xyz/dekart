import styles from './Header.module.css'
import { useDispatch, useSelector } from 'react-redux'
import DekartMenu from './DekartMenu'
import { getUrlRef } from './lib/ref'
import Avatar from 'antd/es/avatar'
import Dropdown from 'antd/es/dropdown'
import { AuthState } from '../proto/dekart_pb'
import classNames from 'classnames'
import { authRedirect } from './actions/redirect'

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
  const userStream = useSelector(state => state.user.stream)
  const { authEnabled } = useSelector(state => state.env)
  const dispatch = useDispatch()
  if (!userStream || !authEnabled) {
    return null
  }
  const items = [{
    label: userStream && userStream.email,
    disabled: true
  }]
  if (token) {
    items.push({
      label: 'Switch account',
      onClick: () => {
        const state = new AuthState()
        state.setUiUrl(window.location.href)
        state.setAction(AuthState.Action.ACTION_REQUEST_CODE)
        state.setSwitchAccount(true)
        dispatch(authRedirect(state))
      }
    })
    items.push({
      label: 'Sign out',
      onClick: () => {
        const state = new AuthState()
        state.setUiUrl(window.location.href)
        state.setAction(AuthState.Action.ACTION_REVOKE)
        state.setAccessTokenToRevoke(token.access_token)
        dispatch(authRedirect(state))
      }
    })
  }
  return (
    <div className={classNames(
      styles.user,
      { [styles.buttonDivider]: buttonDivider }
    )}
    >
      <Dropdown
        overlayClassName={styles.userDropdown} menu={{ items }}
      ><Avatar>{getSignature(userStream.email)}</Avatar>
      </Dropdown>
    </div>
  )
}

export function Header ({ buttons, title }) {
  const env = useSelector(state => state.env)
  const usage = useSelector(state => state.usage)
  let homePage
  if (env.loaded && usage.loaded) {
    homePage = env.variables.UX_HOMEPAGE + '?ref=' + getUrlRef(env, usage)
  }
  return (
    <div className={styles.header}>
      <div className={styles.top}>
        <DekartMenu />
        <div className={styles.middle}>
          <div className={styles.dekartLinkHolder}><a target='_blank' rel='noopener noreferrer' className={styles.dekartLink} href={homePage}><span className={styles.dekartTitle} /></a></div>
        </div>
        <div className={styles.buttons}>{buttons || null}</div>
        <User buttonDivider={Boolean(buttons)} />
      </div>
      {title ? (<div className={styles.title}>{title}</div>) : null}
    </div>
  )
}
