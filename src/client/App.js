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
import { getEnv } from './actions'

function AppRedirect () {
  const httpErrorStatus = useSelector(state => state.httpErrorStatus)
  const { newReportId } = useSelector(state => state.reportStatus)

  if (httpErrorStatus) {
    return <Redirect to={`/${httpErrorStatus}`} />
  }

  if (newReportId) {
    return <Redirect to={`/reports/${newReportId}/source`} />
  }

  return null
}

function RedirectToSource () {
  const { id } = useParams()
  return <Redirect to={`/reports/${id}/source`} />
}

export default function App () {
  const env = useSelector(state => state.env)
  const dispatch = useDispatch()

  useEffect(() => {
    if (!env.loaded) {
      dispatch(getEnv())
    }
  })
  return (
    <Router>
      <Switch>
        <Route exact path='/'>
          <HomePage />
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
        <Route path='/401'>
          <Result icon={<WarningOutlined />} title='401' subTitle='Unauthorized' />
        </Route>
        <Route path='*'>
          <Result icon={<QuestionOutlined />} title='404' subTitle='Page not found' />
        </Route>
      </Switch>
      <AppRedirect />
    </Router>
  )
}
