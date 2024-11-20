import styles from './Header.module.css'
import { useDispatch, useSelector } from 'react-redux'
import DekartMenu from './DekartMenu'
import { getUrlRef } from './lib/ref'
import Avatar from 'antd/es/avatar'
import Dropdown from 'antd/es/dropdown'
import { AuthState } from '../proto/dekart_pb'
import classNames from 'classnames'
import { GlobalOutlined, LockOutlined } from '@ant-design/icons'
import { useHistory } from 'react-router-dom/cjs/react-router-dom'
import { authRedirect } from './actions/redirect'
import Button from 'antd/es/button'
import Tooltip from 'antd/es/tooltip'
import { switchPlayground } from './actions/user'
import localStorageReset from './actions/localStorage'

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
  const history = useHistory()
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
        overlayClassName={styles.userDropdown} menu={{
          items: [
            {
              label: userStream && userStream.email,
              disabled: true
            },
            {
              label: 'Manage workspace',
              onClick: () => {
                history.push('/workspace')
              }
            },
            {
              label: 'Public playground',
              onClick: () => {
                history.push('/playground')
              }
            },
            {
              label: 'Switch account',
              onClick: () => {
                dispatch(localStorageReset())
                const state = new AuthState()
                state.setUiUrl(window.location.href)
                state.setAction(AuthState.Action.ACTION_REQUEST_CODE)
                state.setSwitchAccount(true)
                dispatch(authRedirect(state))
              }
            },
            {
              label: 'Sign out',
              onClick: () => {
                dispatch(localStorageReset())
                const state = new AuthState()
                state.setUiUrl(window.location.href)
                state.setAction(AuthState.Action.ACTION_REVOKE)
                state.setAccessTokenToRevoke(token.access_token)
                dispatch(authRedirect(state))
              }
            }
          ]
        }}
      ><Avatar>{getSignature(userStream && userStream.email)}</Avatar>
      </Dropdown>
    </div>
  )
}

export function Workspace () {
  const workspaceName = useSelector(state => state.workspace?.name)
  const isPlayground = useSelector(state => state.user.isPlayground)
  const history = useHistory()
  if (!workspaceName || isPlayground) {
    return null
  }
  return (
    <div className={styles.workspace}>
      <Tooltip title={<>You are in private workspace.<br />Click to manage workspace access.</>}><Button type='link' size='small' onClick={() => history.push('/workspace')} className={styles.workspaceButton}><LockOutlined />{workspaceName}</Button></Tooltip>
    </div>
  )
}

export function PlaygroundMode () {
  const isPlayground = useSelector(state => state.user.isPlayground)
  const isDefaultWorkspace = useSelector(state => state.user.isDefaultWorkspace)
  const dispatch = useDispatch()

  if (!isPlayground || isDefaultWorkspace) {
    return null
  }

  return (
    <div className={styles.playground}>
      <Tooltip title={
        (
          <div className={styles.playgroundTooltip}>
            <div>Public playground mode is enabled. Your queries are public. Only public datasets are accessible.</div>
            <Button
              size='small' type='link' onClick={() => dispatch(switchPlayground(false))}
            >Switch to private workspace
            </Button>
          </div>
        )
      }
      >
        <Button id='dekart-playground-mode-button' type='link' size='small' className={styles.playgroundButton}><GlobalOutlined /> Playground Mode</Button>
      </Tooltip>
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
        <div className={styles.left}>
          <DekartMenu />
          <Workspace />
          <PlaygroundMode />
        </div>
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
