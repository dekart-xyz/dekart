import Menu from 'antd/es/menu'
import styles from './DekartMenu.module.css'
import { useSelector } from 'react-redux'
import { getRef } from './lib/ref'

export default function DekartMenu () {
  const env = useSelector(state => state.env)
  const usage = useSelector(state => state.usage)
  const ref = getRef(env, usage)
  return (
    <div className={styles.dekartMenu}>
      <Menu mode='horizontal' theme='dark'>
        <Menu.Item key='reports'>
          <a href='/'>Reports</a>
        </Menu.Item>
        <Menu.SubMenu popupClassName={styles.subMenu} title='Support' key='community' active='yes'>
          <Menu.Item key='slack'>
            <a target='_blank' rel='noopener noreferrer' href='https://bit.ly/dekart-slack'>Ask in Slack</a>
          </Menu.Item>
          <Menu.Item key='issues'>
            <a target='_blank' rel='noopener noreferrer' href={'https://github.com/dekart-xyz/dekart/issues?ref=' + ref}>Report Issue</a>
          </Menu.Item>
          <Menu.Item key='documentation'>
            <a target='_blank' rel='noopener noreferrer' href={'https://dekart.xyz/docs/?ref=' + ref}>Documentation</a>
          </Menu.Item>
        </Menu.SubMenu>
        <Menu.Item key='contribute'>
          <a target='_blank' rel='noopener noreferrer' href={'https://dekart.xyz/support-project/?ref=' + ref}>Contribute 💜</a>
        </Menu.Item>
      </Menu>
    </div>
  )
}
