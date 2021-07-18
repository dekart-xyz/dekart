import Menu from 'antd/es/menu'
import styles from './DekartMenu.module.css'
import { useSelector } from 'react-redux'

export default function DekartMenu () {
  const env = useSelector(state => state.env)
  if (!env.loaded) {
    return null
  }
  return (
    <div className={styles.dekartMenu}>
      <Menu mode='horizontal' theme='dark'>
        <Menu.Item>
          <a href='/'>Reports</a>
        </Menu.Item>
        <Menu.SubMenu popupClassName={styles.subMenu} title='Community' active>
          <Menu.Item>
            <a target='_blank' rel='noopener noreferrer' href='https://dekart.xyz/docs/?ref=dekart'>Documentation</a>
          </Menu.Item>
          <Menu.Item>
            <a target='_blank' rel='noopener noreferrer' href='http://github.com/dekart-xyz/dekart/?ref=dekart'>GitHub</a>
          </Menu.Item>
          <Menu.Item>
            <a target='_blank' rel='noopener noreferrer' href='https://github.com/dekart-xyz/dekart/issues?ref=dekart'>Report Issue</a>
          </Menu.Item>
        </Menu.SubMenu>
      </Menu>
    </div>
  )
}
