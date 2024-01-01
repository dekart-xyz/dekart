import Menu from 'antd/es/menu'
import styles from './DekartMenu.module.css'
import { useDispatch, useSelector } from 'react-redux'
import { getRef } from './lib/ref'
import { MenuOutlined, MessageOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom/cjs/react-router-dom'
import { createReport } from './actions/report'

export default function DekartMenu () {
  const env = useSelector(state => state.env)
  const usage = useSelector(state => state.usage)
  const dispatch = useDispatch()
  const { authEnabled } = env
  const userDefinedConnection = useSelector(state => state.connection.userDefined)
  const user = useSelector(state => state.user)
  const ref = getRef(env, usage)
  return (
    <div className={styles.dekartMenu}>
      <Menu mode='horizontal' theme='dark'>
        <Menu.SubMenu
          popupClassName={styles.subMenu} title={<MenuOutlined />} key='home' active='yes' disabled={
          !(user && user.subscriptionActive)
        }
        >
          <Menu.Item key='my'>
            <Link to='/'>{authEnabled ? 'My Reports' : 'Reports'}</Link>
          </Menu.Item>
          <Menu.Item key='shared' disabled={!authEnabled}>
            <Link to='/shared'>Shared reports</Link>
          </Menu.Item>
          {userDefinedConnection
            ? <Menu.Item key='connections'><Link to='/connections'>Connections</Link></Menu.Item>
            : null}
          <Menu.Divider />
          <Menu.Item key='create' onClick={() => dispatch(createReport())}>New Report</Menu.Item>
        </Menu.SubMenu>
        <Menu.SubMenu popupClassName={styles.subMenu} title={<MessageOutlined />} key='community' active='yes'>
          <Menu.Item key='slack'>
            <a target='_blank' rel='noopener noreferrer' href='https://slack.dekart.xyz'>Ask in Slack</a>
          </Menu.Item>
          <Menu.Item key='issues'>
            <a target='_blank' rel='noopener noreferrer' href={'https://github.com/dekart-xyz/dekart/issues?ref=' + ref}>Report Issue</a>
          </Menu.Item>
        </Menu.SubMenu>
        <Menu.Item key='contribute'>
          <a target='_blank' title='Contribute' rel='noopener noreferrer' href={'https://dekart.xyz/support-project/?ref=' + ref}>🩵</a>
        </Menu.Item>
      </Menu>
    </div>
  )
}
