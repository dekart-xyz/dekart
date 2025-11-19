import { useHistory } from 'react-router-dom/cjs/react-router-dom'
import styles from './ReportHeaderButtons.module.css'
import Button from 'antd/es/button'
import { EyeOutlined, DownloadOutlined, CloudOutlined, EditOutlined, ForkOutlined, ReloadOutlined, LoadingOutlined, CloudSyncOutlined, PlusOutlined, InfoCircleOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { useDispatch, useSelector } from 'react-redux'
import ShareButton from './ShareButton'
import { forkReport, saveMap } from './actions/report'
import { runAllQueries } from './actions/query'
import { toggleModal } from '@kepler.gl/actions/dist/ui-state-actions'
import { EXPORT_DATA_ID, EXPORT_IMAGE_ID, EXPORT_MAP_ID } from '@kepler.gl/constants'
import Dropdown from 'antd/es/dropdown'
import { useEffect, useState } from 'react'
import Select from 'antd/es/select'
import { track } from './lib/tracking'
import { ForkOnboarding, useRequireOnboarding } from './ForkOnboarding'
import { AutoRefreshSettingsModal } from './AutoRefreshSettings'
import classNames from 'classnames'
import { goToPresent, goToSource } from './lib/navigation'

function formatIntervalLabel (seconds) {
  if (seconds === 0) return 'None'
  if (seconds === 60) return '1 min'
  if (seconds === 300) return '5 min'
  if (seconds === 600) return '10 min'
  if (seconds === 900) return '15 min'
  if (seconds === 1800) return '30 min'
  if (seconds === 3600) return '1 hour'
  return `${seconds}s`
}

function ForkButton ({ primary }) {
  const dispatch = useDispatch()
  const { id: reportId } = useSelector(state => state.report)
  const userStream = useSelector(state => state.user.stream)
  const userIsPlayground = useSelector(state => state.user.isPlayground)
  const workspaceId = userStream?.workspaceId
  const { allowExport, canWrite } = useSelector(state => state.report)
  const isViewer = useSelector(state => state.user.isViewer)

  const disabled = isViewer || (!allowExport && !canWrite)

  const history = useHistory()

  let onClick = () => {
    track('ForkReport', { reportId })
    dispatch(forkReport(reportId))
  }
  if (!workspaceId && !userIsPlayground) {
    // user has no workspace, redirect to workspace page
    onClick = () => {
      track('ForkReportNoWorkspace', { reportId })
      history.push('/workspace')
    }
  }

  if (primary) {
    if (disabled) {
      return null
    }
    return (
      <Button
        type='primary'
        icon={<ForkOutlined />}
        id='dekart-fork-button'
        disabled={disabled}
        onClick={onClick}
      >Duplicate Map
      </Button>
    )
  }
  return (
    <Button
      type='text'
      icon={<ForkOutlined />}
      disabled={disabled}
      onClick={onClick}
      id='dekart-fork-button'
      title={disabled ? 'Forking maps is disabled for viewers' : 'Duplicate Map'}
    />
  )
}

function RefreshButton ({ showAutoRefreshSettings = false }) {
  const { canRefresh } = useSelector(state => state.report)
  const numRunningQueries = useSelector(state => state.numRunningQueries)
  const numQueries = useSelector(state => state.queries.length)
  const dispatch = useDispatch()
  const { canWrite } = useSelector(state => state.report)
  const edit = useSelector(state => state.reportStatus.edit)
  const [autoRefreshModalVisible, setAutoRefreshModalVisible] = useState(false)
  const autoRefreshIntervalSeconds = useSelector(state => state.report?.autoRefreshIntervalSeconds)
  if (!canRefresh || numQueries === 0) {
    return null
  }

  const handleRefresh = () => {
    if (numRunningQueries) {
      return
    }
    track('RefreshAllQueries')
    dispatch(runAllQueries())
  }

  const items = [
    {
      label: 'Refresh Now',
      key: 'refresh',
      id: 'dekart-refresh-now-button',
      icon: numRunningQueries ? <LoadingOutlined /> : <ReloadOutlined />,
      disabled: numRunningQueries,
      onClick: handleRefresh
    },
    {
      type: 'divider'
    },
    {
      label: autoRefreshIntervalSeconds > 0
        ? `Auto Refresh: ${formatIntervalLabel(autoRefreshIntervalSeconds)} ${edit ? '(paused)' : ''}`
        : 'Auto Refresh Settings',
      key: 'auto-refresh',
      icon: <ClockCircleOutlined />,
      disabled: !canWrite,
      onClick: () => setAutoRefreshModalVisible(true)
    }
  ]

  return (
    <>
      <Dropdown
        menu={{ items }}
        placement='bottomLeft'
        trigger={['click']}
      >
        <Button
          id='dekart-refresh-button'
          type='text'
          icon={numRunningQueries ? <LoadingOutlined /> : autoRefreshIntervalSeconds > 0 ? <span className={classNames({ [styles.shimmerIcon]: !edit })}><ClockCircleOutlined /></span> : <ReloadOutlined />}
          title={autoRefreshIntervalSeconds > 0 ? 'Refresh (Auto-refresh enabled)' : 'Refresh'}
        />
      </Dropdown>
      <AutoRefreshSettingsModal
        visible={autoRefreshModalVisible}
        onClose={() => setAutoRefreshModalVisible(false)}
      />
    </>
  )
}

function useReportChanged () {
  const { lastChanged, lastSaved } = useSelector(state => state.reportStatus)
  return lastChanged > lastSaved
}

function useAutoSave () {
  const { canWrite } = useSelector(state => state.report)
  const dispatch = useDispatch()
  const { saving, online } = useSelector(state => state.reportStatus)
  const changed = useReportChanged()

  useEffect(() => {
    const handler = setTimeout(() => {
      if (changed && canWrite && !saving && online) {
        dispatch(saveMap())
      }
    }, 1000)

    return () => {
      clearTimeout(handler)
    }
  }, [canWrite, saving, changed, online, dispatch])
}

function useRequireWorkspace () {
  const isCloud = useSelector(state => state.env.isCloud)
  const userStream = useSelector(state => state.user.stream)
  const workspaceId = userStream?.workspaceId
  return !workspaceId && isCloud && userStream
}

function WorkspaceOnboarding () {
  const history = useHistory()
  useEffect(() => {
    track('WorkspaceOnboarding')
  }, [])
  return (
    <div className={styles.reportHeaderButtons}>
      <Button
        type='text' icon={<InfoCircleOutlined />}
        href='https://dekart.xyz/?ref=about-maps-button'
        target='_blank'
        title='About Dekart Maps'
        onClick={() => {
          track('AboutDekartMaps')
        }}
      >About Dekart Maps
      </Button>
      <Button
        icon={<PlusOutlined />}
        type='primary' onClick={() => {
          track('WorkspaceOnboardingCreateMap')
          history.push('/workspace')
        }}
      >Create Map
      </Button>
    </div>
  )
}

function EditModeButtons () {
  const dispatch = useDispatch()
  const { canWrite } = useSelector(state => state.report)
  const { saving } = useSelector(state => state.reportStatus)
  const changed = useReportChanged()
  const forkOnboarding = useRequireOnboarding()
  useAutoSave()

  return (
    <div className={styles.reportHeaderButtons}>
      <RefreshButton showAutoRefreshSettings />
      <ExportDropdown />
      {canWrite
        ? (
          <>
            <ForkButton />
            <Button
              id='dekart-save-button'
              title={saving ? 'Saving...' : 'Save this map'}
              type='text'
              ghost
              icon={saving || changed ? <CloudSyncOutlined /> : <CloudOutlined />}
              disabled={saving}
              onClick={() => {
                track('SaveMap')
                dispatch(saveMap())
              }}
            />
            <ViewSelect value='edit' />
            <ShareButton />
          </>
          )
        : (
          <>
            <ShareButton />
            {forkOnboarding ? <ForkOnboarding requireOnboarding={forkOnboarding} edit /> : <ForkButton primary />}
          </>
          )}

    </div>
  )
}

function ExportDropdown () {
  const dispatch = useDispatch()
  const { allowExport } = useSelector(state => state.report)

  const items = [
    {
      label: 'Export:',
      disabled: true
    },
    {
      type: 'divider'
    },
    {
      label: 'Map',
      onClick: () => {
        track('ExportMap')
        dispatch(toggleModal(EXPORT_MAP_ID))
      }
    },
    {
      label: 'Data',
      onClick: () => {
        track('ExportData')
        dispatch(toggleModal(EXPORT_DATA_ID))
      }
    },
    {
      label: 'Image',
      onClick: () => {
        track('ExportImage')
        dispatch(toggleModal(EXPORT_IMAGE_ID))
      }
    }
  ]
  return (
    <Dropdown menu={{ items }} placement='topLeft' disabled={!allowExport}>
      <Button
        type='text'
        title={allowExport ? 'Export' : 'Exporting is disabled'}
        icon={<DownloadOutlined />}
      />
    </Dropdown>
  )
}

function ViewSelect (value) {
  const history = useHistory()
  const { id } = useSelector(state => state.report)
  return (
    <Select
      ghost
      className={styles.reportViewSelect}
      defaultValue={value}
      onChange={(value) => {
        if (value === 'edit') {
          track('SwitchToEditMode', { reportId: id })
          goToSource(history, id)
        } else if (value === 'view') {
          track('SwitchToViewMode', { reportId: id })
          goToPresent(history, id)
        }
      }}
      options={[
        { value: 'view', label: <><EyeOutlined /> Viewing</> },
        { value: 'edit', label: <><EditOutlined /> Editing</> }
      ]}
    />

  )
}

function ViewModeButtons () {
  const { canWrite } = useSelector(state => state.report)

  if (canWrite) {
    return (
      <div className={styles.reportHeaderButtons}>
        <RefreshButton showAutoRefreshSettings />
        <ExportDropdown />
        <ForkButton />
        <ViewSelect value='view' />
        <ShareButton />
      </div>
    )
  }

  return (
    <div className={styles.reportHeaderButtons}>
      <RefreshButton />
      <ExportDropdown />
      <ShareButton />
    </div>
  )
}

export default function ReportHeaderButtons ({ edit }) {
  const requireWorkspace = useRequireWorkspace()
  if (requireWorkspace) {
    return (
      <WorkspaceOnboarding />
    )
  }

  if (edit) {
    return <EditModeButtons />
  }
  return <ViewModeButtons />
}
