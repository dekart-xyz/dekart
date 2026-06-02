import { useState } from 'react'
import Select from 'antd/es/select'
import Divider from 'antd/es/divider'
import Dropdown from 'antd/es/dropdown'
import Button from 'antd/es/button'
import { SettingOutlined, UserOutlined, TeamOutlined, DownOutlined } from '@ant-design/icons'
import { useHistory } from 'react-router-dom/cjs/react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import classNames from 'classnames'
import { PlanType } from 'dekart-proto/dekart_pb'
import styles from './WorkspaceSelector.module.css'
import { switchWorkspace } from './actions/workspace'

export default function WorkspaceSelector () {
  const userStream = useSelector(state => state.user.stream)
  const isPlayground = useSelector(state => state.user.isPlayground)
  const isDefaultWorkspace = useSelector(state => state.user.isDefaultWorkspace)
  const env = useSelector(state => state.env)
  const [isManageHovered, setIsManageHovered] = useState(false)
  const history = useHistory()
  const dispatch = useDispatch()

  if (!userStream || !env.loaded || (isPlayground && !isDefaultWorkspace)) {
    return null
  }
  const workspaces = userStream.userWorkspacesList || []
  const currentWorkspaceId = userStream.workspaceId || workspaces[0]?.id
  if (!currentWorkspaceId || workspaces.length === 0) {
    return null
  }
  const manageDisabled = !env.authEnabled

  const handleChange = (value) => {
    if (value === 'manage') {
      if (manageDisabled) {
        return
      }
      history.push('/workspace')
      return
    }
    dispatch(switchWorkspace(value))
  }

  return (
    <div className={styles.workspaceSelector}>
      <Select
        value={currentWorkspaceId}
        onChange={handleChange}
        className={styles.select}
        showSearch={false}
        dropdownMatchSelectWidth={false}
        optionLabelProp='label'
        dropdownRender={(menu) => (
          <div
            className={classNames(
              styles.dropdown,
              { [styles.manageHovered]: isManageHovered }
            )}
          >
            {menu}
            <Divider style={{ margin: '4px 0' }} />
            <div
              className={classNames(
                styles.manageOption,
                { [styles.manageOptionDisabled]: manageDisabled }
              )}
              onClick={() => handleChange('manage')}
              onMouseEnter={() => setIsManageHovered(true)}
              onMouseLeave={() => setIsManageHovered(false)}
            >
              <SettingOutlined />
              <span>Manage Workspace</span>
            </div>
          </div>
        )}
      >
        {workspaces.map(workspace => {
          const Icon = workspace.planType === PlanType.TYPE_PERSONAL ? UserOutlined : TeamOutlined
          return (
            <Select.Option
              key={workspace.id}
              value={workspace.id}
              label={
                <div className={styles.optionLabel}>
                  <Icon className={styles.optionIcon} />
                  <span className={styles.optionName}>{workspace.name}</span>
                </div>
              }
            >
              <div className={styles.option}>
                <Icon className={styles.optionIcon} />
                <span className={styles.optionName}>{workspace.name}</span>
              </div>
            </Select.Option>
          )
        })}
      </Select>
    </div>
  )
}

// default styling and no management option
export function WorkspaceSelectorLight ({ sourceURL } = { sourceURL: '/' }) {
  const userStream = useSelector(state => state.user.stream)
  const isPlayground = useSelector(state => state.user.isPlayground)
  const env = useSelector(state => state.env)
  const dispatch = useDispatch()

  if (!userStream || !env.loaded || isPlayground || !env.variables.ALLOW_WORKSPACE_CREATION) {
    return null
  }
  const currentWorkspaceId = userStream.workspaceId
  if (!currentWorkspaceId) {
    return null
  }
  const workspaces = userStream.userWorkspacesList.filter(
    workspace => workspace.id !== currentWorkspaceId
  )

  if (workspaces.length === 0) {
    return null
  }

  const items = workspaces.map(workspace => {
    const Icon = workspace.planType === PlanType.TYPE_PERSONAL ? UserOutlined : TeamOutlined
    return {
      key: workspace.id,
      label: (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon />
          <span>{workspace.name}</span>
        </div>
      ),
      onClick: () => {
        dispatch(switchWorkspace(workspace.id, sourceURL))
      }
    }
  })

  return (
    <Dropdown
      menu={{ items }}
      placement='bottomLeft'

    >
      <Button>
        Switch workspace <DownOutlined />
      </Button>
    </Dropdown>
  )
}
