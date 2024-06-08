import React, { useEffect } from 'react'
import {
  BrowserRouter as Router,
  Switch,
  Route,
  Redirect,
  useParams
} from 'react-router-dom'
import ReportPage from './ReportPage'
import HomePage from './HomePage'
import { QuestionOutlined, WarningOutlined } from '@ant-design/icons'
import Result from 'antd/es/result'
import { useSelector, useDispatch } from 'react-redux'
import { getUsage } from './actions/usage'
import { AuthState, RedirectState as DekartRedirectState } from '../proto/dekart_pb'
import { getEnv } from './actions/env'
import { authRedirect, setRedirectState } from './actions/redirect'
import { subscribeUserStream, switchPlayground, unsubscribeUserStream } from './actions/user'
import WorkspacePage from './WorkspacePage'
import GrantScopesPage from './GrantScopesPage'
import { loadLocalStorage } from './actions/localStorage'
import { useLocation } from 'react-router-dom/cjs/react-router-dom'
import { Button } from 'antd'
import { loadSessionStorage } from './actions/sessionStorage'

// RedirectState reads states passed in the URL from the server
function RedirectState () {
  const dispatch = useDispatch()
  const url = new URL(window.location.href)
  const params = new URLSearchParams(url.search)
  let redirectState = null
  if (params.has('redirect_state')) {
    const redirectStateBase64 = params.get('redirect_state')
    const redirectStateStr = atob(redirectStateBase64)
    const redirectStateArr = [].map.call(redirectStateStr, x => x.charCodeAt(0))
    const redirectStateBytes = new Uint8Array(redirectStateArr)
    redirectState = DekartRedirectState.deserializeBinary(redirectStateBytes)
  }
  useEffect(() => {
    if (redirectState) {
      dispatch(setRedirectState(redirectState))
    }
  }, [redirectState, dispatch])
  if (redirectState) {
    params.delete('redirect_state')
    url.search = params.toString()
    return <Redirect to={`${url.pathname}${url.search}`} /> // apparently receives only pathname and search
  }
  return <AppRedirect />
}

function AppRedirect () {
  const httpError = useSelector(state => state.httpError)
  const { status, doNotAuthenticate } = httpError
  const { newReportId } = useSelector(state => state.reportStatus)
  const userStream = useSelector(state => state.user.stream)
  const isPlayground = useSelector(state => state.user.isPlayground)
  const needSensitiveScopes = useSelector(state => state.env.needSensitiveScopes)
  const sensitiveScopesGranted = userStream?.sensitiveScopesGranted
  const sensitiveScopesGrantedOnce = useSelector(state => state.user.sensitiveScopesGrantedOnce)
  const reportOpened = useSelector(state => state.reportStatus.opened)
  const report = useSelector(state => state.report)
  const dispatch = useDispatch()

  useEffect(() => {
    if (status === 401 && doNotAuthenticate === false) {
      const state = new AuthState()
      state.setUiUrl(window.location.href)
      state.setAction(AuthState.Action.ACTION_REQUEST_CODE)
      state.setSensitiveScope(sensitiveScopesGrantedOnce) // if user has granted sensitive scopes once, request them right away without onboarding
      dispatch(authRedirect(state))
    }
  }, [status, doNotAuthenticate, dispatch, sensitiveScopesGrantedOnce])

  if (status === 401 && doNotAuthenticate === false) {
    // redirect to authentication endpoint from useEffect above
    return null
  }

  if (httpError.status) {
    return <Redirect to={`/${httpError.status}`} push />
  }

  if (
    userStream &&
    !userStream.planType &&
    !isPlayground &&
    !(reportOpened && !report) && // report is being loaded
    !(report?.isPlayground) // playground report
  ) {
    return <Redirect to='/workspace' push />
  }

  if (newReportId) {
    return <Redirect to={`/reports/${newReportId}/source`} push />
  }

  if (
    userStream &&
    needSensitiveScopes &&
    !sensitiveScopesGranted &&
    !isPlayground &&
    !(reportOpened && !report) && // report is being loaded
    !(report?.isPlayground) // playground report
  ) {
    return <Redirect to='/grant-scopes' push />
  }

  return null
}

function RedirectToSource () {
  const { id } = useParams()
  return <Redirect to={`/reports/${id}/source`} />
}

function PageHistory ({ visitedPages }) {
  const location = useLocation()
  useEffect(() => {
    visitedPages.current.push(location.pathname)
  }, [location, visitedPages])
  return null
}

function SwitchToPlayground () {
  const dispatch = useDispatch()
  useEffect(() => {
    dispatch(switchPlayground(true))
  }, [dispatch])
  return null
}

function NotFoundPage () {
  const dispatch = useDispatch()
  const workspaceId = useSelector(state => state.user.stream?.workspaceId)
  return (
    <Result
      icon={<QuestionOutlined />} title='404' subTitle={
        <>
          <p>Page not found</p>
          {!workspaceId
            ? (
              <div>
                <p>To access private reports join workspace.</p>
                <Button onClick={() => dispatch(switchPlayground(false, '/workspace'))}>Join workspace</Button>
              </div>
              )
            : null}
        </>
      }
    />
  )
}

export default function App () {
  const errorMessage = useSelector(state => state.httpError.message)
  const status = useSelector(state => state.httpError.status)
  const env = useSelector(state => state.env)
  const envLoaded = env.loaded
  const userDefinedConnection = useSelector(state => state.connection.userDefined)
  const dispatch = useDispatch()
  const visitedPages = React.useRef(['/'])
  const storageLoaded = useSelector(state => state.storage.loaded)
  const page401 = window.location.pathname.startsWith('/401')

  useEffect(() => {
    dispatch(loadSessionStorage())
    dispatch(loadLocalStorage())
  }, [dispatch])

  useEffect(() => {
    if (page401 || envLoaded) {
      return
    }
    dispatch(getEnv())
  }, [dispatch, page401, envLoaded])

  // do not call API until storage is loaded and environment is loaded and not 401
  const loadData = storageLoaded && env.loaded && status !== 401

  useEffect(() => {
    if (!loadData) {
      return
    }
    dispatch(subscribeUserStream())
    dispatch(getUsage())
    return () => {
      dispatch(unsubscribeUserStream())
    }
  }, [dispatch, loadData])

  // do not render until storage is loaded and environment is loaded
  const startRender = loadData || page401 || status === 401
  if (!startRender) {
    return null
  }
  return (
    <Router>
      <PageHistory visitedPages={visitedPages} />
      <RedirectState />
      <Switch>
        <Route exact path='/playground'>
          <SwitchToPlayground />
        </Route>
        <Route exact path='/'>
          <HomePage reportFilter='my' />
        </Route>
        <Route exact path='/grant-scopes'>
          <GrantScopesPage visitedPages={visitedPages} />
        </Route>
        <Route exact path='/shared'>
          <HomePage reportFilter='discoverable' />
        </Route>
        <Route exact path='/connections'>
          {userDefinedConnection ? <HomePage reportFilter='connections' /> : <Redirect to='/' />}
        </Route>
        <Route path='/reports/:id/edit'>
          <RedirectToSource />
        </Route>
        <Route path='/reports/:id/source'>
          <ReportPage edit />
        </Route>
        <Route path='/reports/:id'>
          <ReportPage />
        </Route>
        <Route path='/workspace'>
          <WorkspacePage />
        </Route>
        <Route path='/400'>
          <Result icon={<WarningOutlined />} title='400' subTitle='Bad Request' />
        </Route>
        <Route path='/403'>
          <Result icon={<WarningOutlined />} title='403' subTitle={errorMessage || 'Forbidden'} />
        </Route>
        <Route path='/401'>
          <Result icon={<WarningOutlined />} title='401' subTitle={errorMessage || 'Unauthorized'} />
        </Route>
        <Route path='*'>
          <NotFoundPage />
        </Route>
      </Switch>
    </Router>
  )
}
