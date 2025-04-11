import { useEffect } from 'react'
import styles from './NewVersion.module.css'
import Button from 'antd/es/button'
import { useDispatch, useSelector } from 'react-redux'
import { GiftOutlined } from '@ant-design/icons'
import { getUrlRef } from './lib/ref'
import { testVersion } from './actions/version'

export default function NewVersion () {
  const release = useSelector(state => state.release)
  const env = useSelector(state => state.env)
  const usage = useSelector(state => state.usage)
  const dispatch = useDispatch()
  const { UX_DISABLE_VERSION_CHECK } = env.variables
  useEffect(() => {
    if (!UX_DISABLE_VERSION_CHECK) {
      dispatch(testVersion())
    }
  }, [dispatch, UX_DISABLE_VERSION_CHECK])
  if (release) {
    const ref = getUrlRef(env, usage)
    return (
      <div className={styles.newRelease}>
        <GiftOutlined className={styles.newReleaseIcon} />
        <div className={styles.newReleaseTitle}>New release {release.tag_name} available</div>
        <div>
          <Button type='primary' href={'https://dekart.xyz/docs/self-hosting/upgrade/?ref=' + ref}>Update</Button>
          <Button type='link' href={release.html_url + '?ref=' + ref}>Release Notes</Button>
        </div>
      </div>
    )
  }
  return null
}
