import styles from './Header.module.css'
import { useSelector } from 'react-redux'
import DekartMenu from './DekartMenu'
import { getRef } from './lib/ref'
import Avatar from 'antd/es/avatar'
import Dropdown from 'antd/es/dropdown'
import { AuthState } from '../proto/dekart_pb'
import { authRedirect } from './lib/api'

export function Header ({ buttons, title }) {
  const env = useSelector(state => state.env)
  const { authType } = env
  const token = useSelector(state => state.token)
  console.log('authType', authType)
  const usage = useSelector(state => state.usage)
  let homePage
  if (env.loaded && usage.loaded) {
    homePage = env.variables.UX_HOMEPAGE + '?ref=' + getRef(env, usage)
  }
  return (
    <div className={styles.header}>
      <div className={styles.top}>
        <DekartMenu />
        <div className={styles.middle}>
          <div className={styles.dekartLinkHolder}><a target='_blank' rel='noopener noreferrer' className={styles.dekartLink} href={homePage}>Dekart</a></div>
        </div>
        <div className={styles.buttons}>{buttons || null}</div>
        {authType === 'GOOGLE_OAUTH' && usage.loaded
          ? (
            <div className={styles.user}>
              <Dropdown menu={{
                items: [
                  {
                    label: 'Swicth account',
                    onClick: () => {
                      const state = new AuthState()
                      state.setUiUrl(window.location.href)
                      state.setAction(AuthState.Action.ACTION_REQUEST_CODE)
                      state.setSwitchAccount(true)
                      authRedirect(state)
                    }
                  },
                  {
                    label: 'Sign out',
                    onClick: () => {
                      const state = new AuthState()
                      state.setUiUrl(window.location.href)
                      state.setAction(AuthState.Action.ACTION_REVOKE)
                      state.setTokenJson(JSON.stringify(token))
                      authRedirect(state)
                    }
                  }
                ]
              }}
              ><Avatar>U</Avatar>
              </Dropdown>

            </div>
            )
          : null}
      </div>
      {title ? (<div className={styles.title}>{title}</div>) : null}
    </div>
  )
}
