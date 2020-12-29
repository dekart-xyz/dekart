import styles from './Header.module.css'

export function Header ({ children }) {
  return (<div className={styles.header}>{children}</div>)
}
