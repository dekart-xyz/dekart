import { useState } from 'react'
import Select from 'antd/es/select'
import Divider from 'antd/es/divider'
import { SettingOutlined } from '@ant-design/icons'
import { useHistory } from 'react-router-dom/cjs/react-router-dom'
import classNames from 'classnames'
import styles from './WorkspaceSelector.module.css'

// Mock data for prototyping - will be replaced with real data from Redux/backend later
const MOCK_WORKSPACES = [
  { id: '1', name: 'My Workspace', type: 'private' },
  { id: '2', name: 'Team Alpha', type: 'team' },
  { id: '3', name: 'Project Beta', type: 'team' },
  { id: '4', name: 'Playground', type: 'playground' }
]

export default function WorkspaceSelector () {
  // Mock current workspace - will come from Redux later
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState('1')
  const [isManageHovered, setIsManageHovered] = useState(false)
  const history = useHistory()

  const handleChange = (value) => {
    // Mock handler - will dispatch Redux action later
    if (value === 'manage') {
      history.push('/workspace')
      return
    }
    setCurrentWorkspaceId(value)
    console.log('Workspace changed to:', value)
  }

  return (
    <div className={styles.workspaceSelector}>
      <Select
        value={currentWorkspaceId}
        onChange={handleChange}
        className={styles.select}
        showSearch={false}
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
        {MOCK_WORKSPACES.map(workspace => (
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
