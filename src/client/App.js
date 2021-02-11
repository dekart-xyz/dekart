import React from 'react'
import {
  BrowserRouter as Router,
  Switch,
  Route,
  Redirect,
  useLocation
} from 'react-router-dom'
import ReportPage from './ReportPage'
import HomePage from './HomePage'
import { QuestionOutlined, WarningOutlined } from '@ant-design/icons'
import Result from 'antd/es/result'
import { useSelector } from 'react-redux'

function AppRedirect () {
  const httpErrorStatus = useSelector(state => state.httpErrorStatus)
  // const location = useLocation()
  // console.log(location)
  if (httpErrorStatus) {
    return <Redirect to={`/${httpErrorStatus}`} />
    // const path = `/${httpErrorStatus}`
    // if (location.pathname !== path) {
    //   return <Redirect to={`/${httpErrorStatus}`} />
    // }
  }
  return null
}

export default function App () {
  return (
    <Router>
      <Switch>
        <Route exact path='/'>
          <HomePage />
        </Route>
        <Route path='/reports/:id/edit'>
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
