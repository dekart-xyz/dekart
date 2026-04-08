import React, { useEffect, useMemo, useState } from 'react'
import { Helmet } from 'react-helmet'
import Result from 'antd/es/result'
import Button from 'antd/es/button'
import { useDispatch, useSelector } from 'react-redux'
import { useHistory, useLocation } from 'react-router-dom'
import { authorizeDevice } from './actions/deviceAuth'
import { updateSessionStorage } from './actions/sessionStorage'
import { pendingDeviceAuthorizationKey } from './lib/deviceAuth'
import { Header } from './Header'
import { Loading } from './Loading'
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

// WorkspaceRequiredPanel mirrors workspace onboarding visual hierarchy for device flow.
function WorkspaceRequiredPanel ({ onCreate, onJoin }) {
  return (
    <Result
      status='success'
      icon={<span className={styles.rocketIcon} />}
      title='Finish setup for CLI access'
      subTitle='To complete giskill login, create or join a workspace first.'
      extra={(
        <>
          <Button id='dekart-device-create-workspace' type='primary' onClick={onCreate}>
            Create Workspace
          </Button>
          <Button id='dekart-device-join-workspace' onClick={onJoin}>
            Join Existing Workspace
          </Button>
          <div className={styles.notSure}>
            <div className={styles.notSureItems}>
              <div>→ Step 1: create or join a workspace</div>
              <div>→ Step 2: return to this page</div>
              <div>→ Step 3: click Authorize to finish</div>
            </div>
          </div>
        </>
      )}
    />
  )
}

export default function DeviceAuthorizePage () {
  const dispatch = useDispatch()
  const history = useHistory()
  const location = useLocation()
  const queryDeviceID = useMemo(() => readDeviceID(location.search), [location.search])
  const pendingDeviceID = useSelector(state => state.sessionStorage.current?.[pendingDeviceAuthorizationKey] || '')
  const deviceID = queryDeviceID || pendingDeviceID
  const envLoaded = useSelector(state => state.env.loaded)
  const googleOAuthEnabled = useSelector(state => state.env.googleOAuthEnabled)
  const userStream = useSelector(state => state.user.stream)
  const isAnonymous = useSelector(state => state.user.isAnonymous)
  const workspaceID = userStream?.workspaceId || ''
  const [authorized, setAuthorized] = useState(false)
  const [authorizing, setAuthorizing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!deviceID) {
      return
    }
    if (pendingDeviceID !== deviceID) {
      dispatch(updateSessionStorage(pendingDeviceAuthorizationKey, deviceID))
    }
    if (queryDeviceID) {
      // keep device id out of browser history after initial capture from CLI deep-link.
      history.replace('/device/authorize')
    }
  }, [deviceID, pendingDeviceID, dispatch, queryDeviceID, history])

  // openWorkspaceStep keeps pending device id while routing directly into workspace onboarding step.
  const openWorkspaceStep = (step) => {
    dispatch(updateSessionStorage(pendingDeviceAuthorizationKey, deviceID))
    history.push(`/workspace/${step}`)
  }

  const authorize = async () => {
    setAuthorizing(true)
    setErrorMessage('')
    try {
      await dispatch(authorizeDevice(deviceID))
      dispatch(updateSessionStorage(pendingDeviceAuthorizationKey, ''))
      setAuthorized(true)
    } catch (err) {
      setErrorMessage(getErrorMessage(err))
    } finally {
      setAuthorizing(false)
    }
  }

  if (authorized) {
    return (
      <DeviceAuthorizeLayout title='Device authorized — Dekart'>
        <Result status={pageState.authorized.status} title={pageState.authorized.title} subTitle={pageState.authorized.subtitle} />
      </DeviceAuthorizeLayout>
    )
  }

  if (!deviceID) {
    return (
      <DeviceAuthorizeLayout title='Invalid device request — Dekart'>
        <Result status={pageState.invalid.status} title={pageState.invalid.title} subTitle={pageState.invalid.subtitle} />
      </DeviceAuthorizeLayout>
    )
  }

  if (!envLoaded || !userStream) {
    return (
      <DeviceAuthorizeLayout title='Authorize device — Dekart'>
        <Loading />
      </DeviceAuthorizeLayout>
    )
  }

  if (isAnonymous && googleOAuthEnabled) {
    return (
      <DeviceAuthorizeLayout title='Authorize device — Dekart'>
        <Loading />
      </DeviceAuthorizeLayout>
    )
  }

  if (!workspaceID) {
    return (
      <DeviceAuthorizeLayout title='Workspace required — Dekart'>
        <WorkspaceRequiredPanel
          onCreate={() => openWorkspaceStep('create')}
          onJoin={() => openWorkspaceStep('join')}
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
