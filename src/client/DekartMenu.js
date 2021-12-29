import Menu from 'antd/es/menu'
import styles from './DekartMenu.module.css'
import { useSelector } from 'react-redux'
import { getRef } from './lib/ref'

export default function DekartMenu () {
  const env = useSelector(state => state.env)
  if (!env.loaded) {
    return null
  }
  const ref = getRef()
  return (
    <div className={styles.dekartMenu}>
      <Menu mode='horizontal' theme='dark'>
        <Menu.Item key='reports'>
          <a href='/'>Reports</a>
        </Menu.Item>
        <Menu.SubMenu popupClassName={styles.subMenu} title='Community' key='community' active='yes'>
          <Menu.Item key='documentation'>
            <a target='_blank' rel='noopener noreferrer' href={'https://dekart.xyz/docs/?ref=' + ref}>Documentation</a>
          </Menu.Item>
          <Menu.Item key='github'>
            <a target='_blank' rel='noopener noreferrer' href={'http://github.com/dekart-xyz/dekart/?ref=' + ref}>GitHub</a>
          </Menu.Item>
          <Menu.Item key='issues'>
            <a target='_blank' rel='noopener noreferrer' href={'https://github.com/dekart-xyz/dekart/issues?ref=' + ref}>Report Issue</a>
          </Menu.Item>
        </Menu.SubMenu>
      </Menu>
    </div>
  )
}
