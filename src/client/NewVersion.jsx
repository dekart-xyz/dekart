import { useEffect } from 'react'
import styles from './NewVersion.module.css'
import Button from 'antd/es/button'
import Text from 'antd/es/typography/Text'
import { useDispatch, useSelector } from 'react-redux'
import { GiftOutlined } from '@ant-design/icons'
import { getUrlRef } from './lib/ref'
import { testVersion } from './actions/version'

export default function NewVersion () {
  const release = useSelector(state => state.release)
  const env = useSelector(state => state.env)
  const usage = useSelector(state => state.usage)
  const dispatch = useDispatch()
  const { UX_DISABLE_VERSION_CHECK, VERSION_CHECK_URL, VERSION_CHECK_FORCE_CURRENT_VERSION } = env.variables
  useEffect(() => {
    if (!env.loaded || UX_DISABLE_VERSION_CHECK) {
      return
    }
    dispatch(testVersion(env.variables))
  }, [dispatch, env.loaded, UX_DISABLE_VERSION_CHECK, VERSION_CHECK_URL, VERSION_CHECK_FORCE_CURRENT_VERSION])
  if (release) {
    const ref = getUrlRef(env, usage)
    return (
      <div className={styles.banner} role='status'>
        <div className={styles.message}>
          <GiftOutlined className={styles.icon} aria-hidden />
          <Text className={styles.headline}>
            New release {release.tag_name} available
          </Text>
        </div>
        <div className={styles.actions}>
          <Button type='default' ghost href={release.html_url + '?ref=' + ref}>Update</Button>
          <Button type='link' className={styles.releaseNotesLink} href={release.html_url + '?ref=' + ref}>Release Notes</Button>
        </div>
      </div>
    )
  }
  return null
}
