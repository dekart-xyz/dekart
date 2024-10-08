import Menu from 'antd/es/menu'
import styles from './DekartMenu.module.css'
import { useDispatch, useSelector } from 'react-redux'
import { getUrlRef } from './lib/ref'
import { MenuOutlined, MessageOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom/cjs/react-router-dom'
import { createReport } from './actions/report'
import Tooltip from 'antd/es/tooltip'

const popupOffset = [-10, 0]

export default function DekartMenu () {
  const env = useSelector(state => state.env)
  const usage = useSelector(state => state.usage)
  const userDefinedConnection = useSelector(state => state.connection.userDefined)
  const dispatch = useDispatch()
  const { authEnabled } = env
  const ref = getUrlRef(env, usage)
  return (
    <div className={styles.dekartMenu}>
      <Menu mode='horizontal' theme='dark'>
        <Menu.SubMenu
          popupOffset={popupOffset}
          popupClassName={styles.subMenu} title={<MenuOutlined />} key='home' active='yes'
        >
          {authEnabled
            ? (
              <>
                <Menu.Item key='my'>
                  <Link to='/'>My Reports</Link>
                </Menu.Item>
                <Menu.Item key='shared'>
                  <Link to='/shared'>Shared Reports</Link>
                </Menu.Item>
              </>
              )
            : (
              <Menu.Item key='reports'>
                <Link to='/'>Reports</Link>
              </Menu.Item>
              )}
          {userDefinedConnection ? (<Menu.Item key='connections'><Link to='/connections'>Connections</Link></Menu.Item>) : null}
          <Menu.Divider />
          <Menu.Item key='create' onClick={() => dispatch(createReport())}>New Report</Menu.Item>
        </Menu.SubMenu>
        <Menu.SubMenu popupClassName={styles.subMenu} popupOffset={popupOffset} title={<MessageOutlined />} key='community' active='yes'>
          <Menu.Item key='slack'>
            <a target='_blank' rel='noopener noreferrer' href='https://slack.dekart.xyz'>Ask in Slack</a>
          </Menu.Item>
          <Menu.Item key='issues'>
            <a target='_blank' rel='noopener noreferrer' href={'https://github.com/dekart-xyz/dekart/issues?ref=' + ref}>Report Issue</a>
          </Menu.Item>
          <Menu.Item key='examples'>
            <a target='_blank' rel='noopener noreferrer' href={'https://dekart.xyz/docs/about/kepler-gl-map-examples?ref=' + ref}>Map Examples</a>
          </Menu.Item>
        </Menu.SubMenu>
        <Menu.Item key='contribute'>
          <Tooltip color='#328EB2' title={<>Loving Dekart?<br />Help community find it.<br />Give us ⭐️ on GitHub!</>}><a target='_blank' rel='noopener noreferrer' href='https://github.com/dekart-xyz/dekart'>🩵</a></Tooltip>
        </Menu.Item>
      </Menu>
    </div>
  )
}
