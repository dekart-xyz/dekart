import { useState } from 'react'
import Select from 'antd/es/select'
import Divider from 'antd/es/divider'
import { SettingOutlined } from '@ant-design/icons'
import { useHistory } from 'react-router-dom/cjs/react-router-dom'
import { useSelector } from 'react-redux'
import classNames from 'classnames'
import styles from './WorkspaceSelector.module.css'

export default function WorkspaceSelector () {
  const userStream = useSelector(state => state.user.stream)
  const isPlayground = useSelector(state => state.user.isPlayground)
  const env = useSelector(state => state.env)
  const [isManageHovered, setIsManageHovered] = useState(false)
  const history = useHistory()

  if (!userStream || !env.loaded || isPlayground || !env.variables.ALLOW_WORKSPACE_CREATION) {
    return null
  }
  const workspaceId = userStream?.workspaceId
  if (!workspaceId) {
    return null
  }
  const workspaces = userStream.userWorkspacesList || []
  const currentWorkspaceId = userStream.workspaceId || (workspaces[0] && workspaces[0].id) || null

  const handleChange = (value) => {
    if (value === 'manage') {
      history.push('/workspace')
      return
    }
    console.log('Workspace changed to:', value)
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
              className={styles.manageOption}
              onClick={() => handleChange('manage')}
              onMouseEnter={() => setIsManageHovered(true)}
              onMouseLeave={() => setIsManageHovered(false)}
            >
              <SettingOutlined />
              <span>Manage</span>
            </div>
          </div>
        )}
      >
        {workspaces.map(workspace => (
          <Select.Option key={workspace.id} value={workspace.id} label={workspace.name}>
            <div className={styles.option}>
              <span className={styles.optionName}>{workspace.name}</span>
            </div>
          </Select.Option>
        ))}
      </Select>
    </div>
  )
}
