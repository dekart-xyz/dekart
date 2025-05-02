import Menu from 'antd/es/menu'
import styles from './DekartMenu.module.css'
import { useDispatch, useSelector } from 'react-redux'
import { getUrlRef } from './lib/ref'
import { MenuOutlined, MessageOutlined, GlobalOutlined, LockOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom/cjs/react-router-dom'
import { createReport } from './actions/report'
import Tooltip from 'antd/es/tooltip'

const popupOffset = [-10, 0]

function WorkspaceIndicator () {
  const workspaceName = useSelector(state => state.workspace?.name)

  const isPlayground = useSelector(state => state.user.isPlayground)
  const workspaceId = useSelector(state => state.user.stream?.workspaceId)
  if (!isPlayground && !workspaceId) {
    return null
  }

  if (workspaceId) {
    return (
      <Menu.Item className={styles.workspaceIndicator} disabled key='workspaces'>
        <LockOutlined /> {workspaceName} Workspace
      </Menu.Item>
    )
  }

  if (isPlayground) {
    return (
      <Menu.Item className={styles.workspaceIndicator} disabled key='workspaces'>
        <GlobalOutlined /> Playground Workspace
      </Menu.Item>
    )
  }
}

export default function DekartMenu () {
  const env = useSelector(state => state.env)
  const usage = useSelector(state => state.usage)
  const userDefinedConnection = useSelector(state => state.connection.userDefined)
  const dispatch = useDispatch()
  const { authEnabled } = env
  const isPlayground = useSelector(state => state.user.isPlayground)
  const isViewer = useSelector(state => state.user.isViewer)
  const ref = getUrlRef(env, usage)
  return (
    <div className={styles.dekartMenu}>
      <Menu mode='horizontal' theme='dark'>
        <Menu.SubMenu
          id='dekart-main-menu'
          popupOffset={popupOffset}
          popupClassName={styles.subMenu} title={<MenuOutlined />} key='home' active='yes'
        >
          {authEnabled
            ? (
              <>
                <WorkspaceIndicator />
                <Menu.Item key='my'>
                  <Link to='/'>My Reports</Link>
                </Menu.Item>
                <Menu.Item key='shared' disabled={isPlayground}>
                  <Link to='/shared'>Shared reports</Link>
                </Menu.Item>
              </>
              )
            : (
              <Menu.Item key='reports'>
                <Link to='/'>Reports</Link>
              </Menu.Item>
              )}
          {userDefinedConnection ? (<Menu.Item key='connections'><Link to='/connections'>Connections</Link></Menu.Item>) : null}
          <Menu.Item key='create' disabled={isViewer} onClick={() => dispatch(createReport())}>New Report</Menu.Item>
        </Menu.SubMenu>
        <Menu.SubMenu popupClassName={styles.subMenu} popupOffset={popupOffset} title={<MessageOutlined />} key='community' active='yes'>
          <Menu.Item key='gpt'>
            <a target='_blank' rel='noopener noreferrer' href='https://chatgpt.com/g/g-onSLtzQQB-overture-maps-gpt'>Overture Maps GPT</a>
          </Menu.Item>
          <Menu.Item key='examples'>
            <a target='_blank' rel='noopener noreferrer' href={'https://dekart.xyz/docs/about/kepler-gl-map-examples?ref=' + ref}>Map Examples</a>
          </Menu.Item>
          <Menu.Item key='slack'>
            <a target='_blank' rel='noopener noreferrer' href='https://slack.dekart.xyz'>Ask in Slack</a>
          </Menu.Item>
          <Menu.Item key='issues'>
            <a target='_blank' rel='noopener noreferrer' href={'https://github.com/dekart-xyz/dekart/issues?ref=' + ref}>Report Issue</a>
          </Menu.Item>
        </Menu.SubMenu>
        <Menu.Item key='contribute'>
          <Tooltip color='#328EB2' title={<>Loving Dekart?<br />Help community find it.<br />Give us ⭐️ on GitHub!</>}><a target='_blank' rel='noopener noreferrer' href='https://github.com/dekart-xyz/dekart'>🩵</a></Tooltip>
        </Menu.Item>
      </Menu>
    </div>
  )
}
