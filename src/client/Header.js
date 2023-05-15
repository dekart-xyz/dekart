import styles from './Header.module.css'
import { useSelector } from 'react-redux'
import DekartMenu from './DekartMenu'
import { getRef } from './lib/ref'

export function Header ({ buttons, title }) {
  const env = useSelector(state => state.env)
  const usage = useSelector(state => state.usage)
  let homePage
  if (env.loaded) {
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
      </div>
      {title ? (<div className={styles.title}>{title}</div>) : null}
    </div>
  )
}
