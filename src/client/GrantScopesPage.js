import { Header } from './Header'
import styles from './GrantScopesPage.module.css'
import Result from 'antd/es/result'
import Button from 'antd/es/button'
import { useDispatch, useSelector } from 'react-redux'
import { requestSensitiveScopes } from './actions/redirect'
import { CloudTwoTone, FileProtectOutlined } from '@ant-design/icons'
import { useEffect } from 'react'
import { Redirect } from 'react-router-dom/cjs/react-router-dom'
import { track } from './lib/tracking'

function getLastPage (visitedPages) {
  return visitedPages.current.filter(page => page !== '/grant-scopes').pop()
}

export default function GrantScopesPage ({ visitedPages }) {
  const dispatch = useDispatch()
  const sensitiveScopesGranted = useSelector(state => state.user.sensitiveScopesGranted)
  const sensitiveScopesGrantedOnce = useSelector(state => state.user.sensitiveScopesGrantedOnce)

  useEffect(() => {
    if (
      sensitiveScopesGranted // user has already granted sensitive scopes
    ) {
      return
    }
    if (sensitiveScopesGrantedOnce) { // user has granted sensitive scopes once, request them right away without onboarding
      dispatch(requestSensitiveScopes(getLastPage(visitedPages)))
    }
  }
  , [dispatch, sensitiveScopesGranted, visitedPages, sensitiveScopesGrantedOnce])

  if (sensitiveScopesGranted) {
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
          title='Grant Access to Google Cloud'
          subTitle={(
            <>
              <p>Dekart uses BigQuery passthrough authentication and requests short-lived tokens stored only in your browser, ensuring no tokens or query results are stored on its backend.</p>
              <p style={{
                fontSize: '1.2em'
              }}
              ><FileProtectOutlined /> <a href='https://dekart.xyz/docs/usage/google-cloud-grant-scopes-faq/' target='_blank' rel='noreferrer'>Verified by Google’s Trust & Safety Team</a>
              </p>
            </>
          )}
          extra={(
            <Button
              type='primary' onClick={() => {
                track('RequestSensitiveScopes')
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
