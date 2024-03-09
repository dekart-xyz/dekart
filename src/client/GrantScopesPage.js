import { Header } from './Header'
import styles from './GrantScopesPage.module.css'
import Result from 'antd/es/result'
import Button from 'antd/es/button'
import { useDispatch, useSelector } from 'react-redux'
import { requestSensitiveScopes } from './actions/redirect'
import { UnlockTwoTone } from '@ant-design/icons'
import { useEffect } from 'react'
import { Redirect } from 'react-router-dom/cjs/react-router-dom'

function getLastPage (visitedPages) {
  return visitedPages.current.filter(page => page !== '/grant-scopes').pop()
}

export default function GrantScopesPage ({ visitedPages }) {
  const dispatch = useDispatch()
  const user = useSelector(state => state.user)
  // const needSensitiveScopes = useSelector(state => state.env.needSensitiveScopes)
  // const sensitiveScopesGranted = user?.sensitiveScopesGranted
  // const sensitiveScopesGrantedOnce = user?.sensitiveScopesGrantedOnce

  useEffect(() => {
    if (!user || user.sensitiveScopesGranted) {
      return
    }
    if (user.sensitiveScopesGrantedOnce) {
      console.log('Requesting sensitive scopes', visitedPages.current)
      dispatch(requestSensitiveScopes(getLastPage(visitedPages)))
    }
  }
  , [dispatch, user, visitedPages])

  if (!user) {
    return null
  }

  if (user.sensitiveScopesGranted) {
    // user shouldn't be here
    return <Redirect to='/' push />
  }

  if (user.sensitiveScopesGrantedOnce) {
    // user will be automatically redirected to the auth page in useEffect above
    return null
  }

  return (
    <div className={styles.grantScopesPage}>
      <Header />
      <div className={styles.body}>
        <Result
          icon={<UnlockTwoTone />}
          title='Grant Access'
          subTitle='Connect and visualize your data from Google Cloud.'
          extra={(
            <Button
              type='primary' onClick={() => {
                dispatch(requestSensitiveScopes(getLastPage(visitedPages)))
              }}
            >Continue
            </Button>
          )}
        />
      </div>
    </div>
  )
}
