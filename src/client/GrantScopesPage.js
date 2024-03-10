import { Header } from './Header'
import styles from './GrantScopesPage.module.css'
import Result from 'antd/es/result'
import Button from 'antd/es/button'
import { useDispatch, useSelector } from 'react-redux'
import { requestSensitiveScopes } from './actions/redirect'
import { CloudTwoTone } from '@ant-design/icons'
import { useEffect } from 'react'
import { Redirect } from 'react-router-dom/cjs/react-router-dom'

function getLastPage (visitedPages) {
  return visitedPages.current.filter(page => page !== '/grant-scopes').pop()
}

export default function GrantScopesPage ({ visitedPages }) {
  const dispatch = useDispatch()
  const userStream = useSelector(state => state.user.stream)
  const sensitiveScopesGrantedOnce = useSelector(state => state.user.sensitiveScopesGrantedOnce)

  useEffect(() => {
    if (
      !userStream || // userStream is not yet loaded
      userStream.sensitiveScopesGranted // user has already granted sensitive scopes
    ) {
      return
    }
    if (sensitiveScopesGrantedOnce) { // user has granted sensitive scopes once, request them right away without onboarding
      dispatch(requestSensitiveScopes(getLastPage(visitedPages)))
    }
  }
  , [dispatch, userStream, visitedPages, sensitiveScopesGrantedOnce])

  if (!userStream) {
    return null
  }

  if (userStream.sensitiveScopesGranted) {
    // user shouldn't be here
    return <Redirect to='/' push />
  }

  if (sensitiveScopesGrantedOnce) {
    // user will be automatically redirected to the auth page in useEffect above
    return null
  }

  return (
    <div className={styles.grantScopesPage}>
      <Header />
      <div className={styles.body}>
        <Result
          icon={<CloudTwoTone />}
          title='Grant access to Google Cloud'
          subTitle={<>Dekart needs access to your <b>BigQuery</b> and <b>Google Cloud Storage</b> to query and store results.<br /> Your token is not stored in Dekart. You can revoke access by signing out of Dekart anytime.</>}
          extra={(
            <Button
              type='primary' onClick={() => {
                dispatch(requestSensitiveScopes(getLastPage(visitedPages)))
              }}
            >Continue to Google
            </Button>
          )}
        />
      </div>
    </div>
  )
}
