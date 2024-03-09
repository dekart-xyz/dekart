import React, { useEffect } from 'react'
import {
  BrowserRouter as Router,
  Switch,
  Route,
  Redirect,
  useParams,
  useLocation
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
import { subscribeUserStream, unsubscribeUserStream } from './actions/user'
import GrantScopesPage from './GrantScopesPage'

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
  const user = useSelector(state => state.user)
  const needSensitiveScopes = useSelector(state => state.env.needSensitiveScopes)
  const sensitiveScopesGranted = user?.sensitiveScopesGranted
  const sensitiveScopesGrantedOnce = user?.sensitiveScopesGrantedOnce
  const location = useLocation()
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

  if (httpError.status && location.pathname !== `/${httpError.status}`) {
    return <Redirect to={`/${httpError.status}`} push />
  }

  if (newReportId) {
    return <Redirect to={`/reports/${newReportId}/source`} push />
  }

  if (user && needSensitiveScopes && !sensitiveScopesGranted) {
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

export default function App () {
  const errorMessage = useSelector(state => state.httpError.message)
  const status = useSelector(state => state.httpError.status)
  const env = useSelector(state => state.env)
  const usage = useSelector(state => state.usage)
  const userDefinedConnection = useSelector(state => state.connection.userDefined)
  const dispatch = useDispatch()
  const visitedPages = React.useRef(['/'])
  // const location = useLocation()

  // // keep track of visited pages
  // useEffect(() => {
  //   visitedPages.current.push(location.pathname)
  // }, [location])

  useEffect(() => {
    if (window.location.pathname.startsWith('/401')) {
      // do not load env and usage on 401 page
      return
    }
    if (status === 401) {
      return
    }
    if (!env.loaded) {
      dispatch(getEnv())
    }
    if (!usage.loaded) {
      dispatch(getUsage())
    }
  }, [env, usage, dispatch, status])
  useEffect(() => {
    dispatch(subscribeUserStream())
    return () => {
      dispatch(unsubscribeUserStream())
    }
  }, [dispatch])
  return (
    <Router>
      <PageHistory visitedPages={visitedPages} />
      <RedirectState />
      <Switch>
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
          <Result icon={<QuestionOutlined />} title='404' subTitle='Page not found' />
        </Route>
      </Switch>
    </Router>
  )
}
