import React, { useMemo, useState } from 'react'
import { Helmet } from 'react-helmet'
import Result from 'antd/es/result'
import Button from 'antd/es/button'
import { AuthState } from 'dekart-proto/dekart_pb'
import { useDispatch, useSelector } from 'react-redux'
import { useHistory, useLocation } from 'react-router-dom'
import { authRedirect } from './actions/redirect'
import { authorizeDevice } from './actions/deviceAuth'
import { consumePendingDeviceAuthorization, rememberPendingDeviceAuthorization } from './lib/deviceAuth'
import { Header } from './Header'
import styles from './DeviceAuthorizePage.module.css'

const pageState = {
  invalid: {
    status: 'error',
    title: 'Invalid device request',
    subtitle: 'Missing or invalid device id.'
  },
  authorized: {
    status: 'success',
    title: 'Device authorized',
    subtitle: 'You can close this tab and return to your terminal.'
  },
  login: {
    status: 'info',
    title: 'Login required',
    subtitle: 'Sign in to continue authorizing this device.',
    actionLabel: 'Login with Google'
  },
  workspace: {
    status: 'warning',
    title: 'Workspace required',
    subtitle: 'Create or join a workspace first, then authorize this device.',
    actionLabel: 'Open workspace setup'
  },
  approve: {
    status: 'info',
    title: 'Authorize this device',
    subtitle: 'Confirm this request to let your terminal access Dekart.',
    actionLabel: 'Authorize'
  }
}

// readDeviceID extracts device id from query string and normalizes whitespace.
function readDeviceID (search) {
  const params = new URLSearchParams(search)
  return (params.get('device_id') || '').trim()
}

// getErrorMessage normalizes gRPC errors to a user-facing authorization failure message.
function getErrorMessage (err) {
  const message = String(err?.message || '').toLowerCase()
  if (message.includes('expired')) {
    return 'Device session expired. Run giskill dekart init again.'
  }
  if (message.includes('workspace required')) {
    return 'Workspace required. Finish workspace setup and retry.'
  }
  if (message.includes('login required') || message.includes('unauthenticated')) {
    return 'Login required. Sign in and retry.'
  }
  return 'Could not authorize this device.'
}

// DeviceAuthorizeLayout renders the shared page shell consistent with GrantScopesPage.
function DeviceAuthorizeLayout ({ title, children }) {
  return (
    <div className={styles.deviceAuthorizePage}>
      <Helmet><title>{title}</title></Helmet>
      <Header />
      <div className={styles.body}>
        {children}
      </div>
    </div>
  )
}

export default function DeviceAuthorizePage () {
  const dispatch = useDispatch()
  const history = useHistory()
  const location = useLocation()
  const deviceID = useMemo(() => readDeviceID(location.search), [location.search])
  const googleOAuthEnabled = useSelector(state => state.env.googleOAuthEnabled)
  const isAnonymous = useSelector(state => state.user.isAnonymous)
  const workspaceID = useSelector(state => state.user.stream?.workspaceId || '')
  const [authorized, setAuthorized] = useState(false)
  const [authorizing, setAuthorizing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const login = () => {
    const state = new AuthState()
    state.setUiUrl(window.location.href)
    state.setAction(AuthState.Action.ACTION_REQUEST_CODE)
    dispatch(authRedirect(state))
  }

  const openWorkspace = () => {
    rememberPendingDeviceAuthorization(deviceID)
    history.push('/workspace')
  }

  const authorize = async () => {
    setAuthorizing(true)
    setErrorMessage('')
    try {
      await dispatch(authorizeDevice(deviceID))
      consumePendingDeviceAuthorization()
      setAuthorized(true)
    } catch (err) {
      setErrorMessage(getErrorMessage(err))
    } finally {
      setAuthorizing(false)
    }
  }

  if (!deviceID) {
    return (
      <DeviceAuthorizeLayout title='Invalid device request — Dekart'>
        <Result status={pageState.invalid.status} title={pageState.invalid.title} subTitle={pageState.invalid.subtitle} />
      </DeviceAuthorizeLayout>
    )
  }

  if (authorized) {
    return (
      <DeviceAuthorizeLayout title='Device authorized — Dekart'>
        <Result status={pageState.authorized.status} title={pageState.authorized.title} subTitle={pageState.authorized.subtitle} />
      </DeviceAuthorizeLayout>
    )
  }

  if (isAnonymous && googleOAuthEnabled) {
    return (
      <DeviceAuthorizeLayout title='Login required — Dekart'>
        <Result
          status={pageState.login.status}
          title={pageState.login.title}
          subTitle={pageState.login.subtitle}
          extra={<Button type='primary' onClick={login}>{pageState.login.actionLabel}</Button>}
        />
      </DeviceAuthorizeLayout>
    )
  }

  if (!workspaceID) {
    return (
      <DeviceAuthorizeLayout title='Workspace required — Dekart'>
        <Result
          status={pageState.workspace.status}
          title={pageState.workspace.title}
          subTitle={pageState.workspace.subtitle}
          extra={<Button type='primary' onClick={openWorkspace}>{pageState.workspace.actionLabel}</Button>}
        />
      </DeviceAuthorizeLayout>
    )
  }

  return (
    <DeviceAuthorizeLayout title='Authorize device — Dekart'>
      <Result
        status={pageState.approve.status}
        title={pageState.approve.title}
        subTitle={(
          <div>
            <div>{pageState.approve.subtitle}</div>
            <div className={styles.deviceId}>Device ID: {deviceID}</div>
            {errorMessage ? <div className={styles.error}>{errorMessage}</div> : null}
          </div>
        )}
        extra={(
          <Button type='primary' loading={authorizing} onClick={authorize}>
            {pageState.approve.actionLabel}
          </Button>
        )}
      />
    </DeviceAuthorizeLayout>
  )
}
