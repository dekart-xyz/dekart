import Menu from 'antd/es/menu'
import styles from './DekartMenu.module.css'
import { useDispatch, useSelector } from 'react-redux'
import { getUrlRef } from './lib/ref'
import { MenuOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom/cjs/react-router-dom'
import { createReport } from './actions/report'
import Tooltip from 'antd/es/tooltip'
import { track } from './lib/tracking'

const popupOffset = [-10, 0]

export default function DekartMenu () {
  const env = useSelector(state => state.env)
  const usage = useSelector(state => state.usage)
  const userDefinedConnection = useSelector(state => state.connection.userDefined)
  const dispatch = useDispatch()
  const { authEnabled } = env
  const isPlayground = useSelector(state => state.user.isPlayground)
  const isSnowpark = useSelector(state => state.env.isSnowpark)
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
                <Menu.Item key='my' onClick={() => track('NavigateToMyMaps')}>
                  <Link to='/'>My Maps</Link>
                </Menu.Item>
                <Menu.Item key='shared' disabled={isPlayground} onClick={() => track('NavigateToSharedMaps')}>
                  <Link to='/shared'>Shared Maps</Link>
                </Menu.Item>
              </>
              )
            : (
              <Menu.Item key='reports' onClick={() => track('NavigateToMaps')}>
                <Link to='/'>Maps</Link>
              </Menu.Item>
              )}
          {userDefinedConnection
            ? (
              <Menu.Item key='connections' onClick={() => track('NavigateToConnections')}>
                <Link to='/connections'>Connections</Link>
              </Menu.Item>
              )
            : null}
          <Menu.Item
            key='create'
            disabled={isViewer}
            onClick={() => {
              track('CreateNewMap')
              dispatch(createReport())
            }}
          >
            New Map
          </Menu.Item>
          <Menu.Divider />
          {isSnowpark && (
            <Menu.Item key='snowflake-kepler-gl-examples' onClick={() => track('ClickedSnowflakeKeplerGlExamples')}>
              <a target='_blank' rel='noopener noreferrer' href={'https://dekart.xyz/docs/snowflake-snowpark/about/?ref=' + ref}>Configure Access</a>
            </Menu.Item>
          )}
          {!isSnowpark && (
            <Menu.Item key='gpt' onClick={() => track('ClickedOvertureMapsGPT')}>
              <a target='_blank' rel='noopener noreferrer' href='https://chatgpt.com/g/g-onSLtzQQB-overture-maps-gpt'>Overture Maps GPT</a>
            </Menu.Item>
          )}
          <Menu.Item key='examples' onClick={() => track('ClickedMapExamples')}>
            <a
              target='_blank' rel='noopener noreferrer' href={
              isSnowpark ? 'https://dekart.xyz/docs/about/snowflake-kepler-gl-examples/?ref=' + ref : 'https://dekart.xyz/docs/about/kepler-gl-map-examples?ref=' + ref
            }
            >Map Examples
            </a>
          </Menu.Item>
          <Menu.Item key='slack' onClick={() => track('ClickedAskInSlack')}>
            <a target='_blank' rel='noopener noreferrer' href='https://slack.dekart.xyz'>Slack Support</a>
          </Menu.Item>
        </Menu.SubMenu>
        {
          !isSnowpark && (
            <Menu.Item key='contribute' onClick={() => track('ClickedGitHubStar')}>
              <Tooltip color='#328EB2' title={<>Loving Dekart?<br />Help community find it.<br />Give us ⭐️ on GitHub!</>}><a target='_blank' rel='noopener noreferrer' href='https://github.com/dekart-xyz/dekart'>🩵</a></Tooltip>
            </Menu.Item>
          )
        }
      </Menu>
    </div>
  )
}
