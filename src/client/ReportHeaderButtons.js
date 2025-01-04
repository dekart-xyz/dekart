import { useHistory } from 'react-router'
import styles from './ReportHeaderButtons.module.css'
import Button from 'antd/es/button'
import { FullscreenOutlined, DownloadOutlined, CloudOutlined, EditOutlined, ConsoleSqlOutlined, ForkOutlined, ReloadOutlined, LoadingOutlined, CloudSyncOutlined } from '@ant-design/icons'
import { useDispatch, useSelector } from 'react-redux'
import ShareButton from './ShareButton'
import { forkReport, saveMap } from './actions/report'
import { runAllQueries } from './actions/query'
import { toggleModal } from '@dekart-xyz/kepler.gl/dist/actions/ui-state-actions'
import { EXPORT_DATA_ID, EXPORT_IMAGE_ID, EXPORT_MAP_ID } from '@dekart-xyz/kepler.gl/dist/constants'
import Dropdown from 'antd/es/dropdown'
import Tooltip from 'antd/es/tooltip'
import { useEffect } from 'react'

function ForkButton ({ primary }) {
  const dispatch = useDispatch()
  const { id: reportId, isPlayground: isPlaygroundReport, isPublic, canWrite } = useSelector(state => state.report)
  const userStream = useSelector(state => state.user.stream)
  const userIsPlayground = useSelector(state => state.user.isPlayground)
  const workspaceId = userStream?.workspaceId
  const isViewer = useSelector(state => state.user.isViewer)

  // user has workspace, but report is from playground
  // we don't know how to match users connections to report connections
  const disabled = (workspaceId && isPlaygroundReport) || isViewer

  const history = useHistory()

  if (isPublic && !canWrite) {
    // public reports can't be forked
    return null
  }

  let onClick = () => {
    dispatch(forkReport(reportId))
  }
  if (!workspaceId && !userIsPlayground) {
    // user has no workspace, redirect to workspace page
    onClick = () => {
      history.push('/workspace')
    }
  }

  if (primary && !disabled) {
    return (
      <Button
        type='primary'
        icon={<ForkOutlined />}
        disabled={disabled}
        onClick={onClick}
      >Fork
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
      title={disabled ? 'Forking is disabled for playground reports' : 'Fork this report'}
    />
  )
}

function RefreshButton () {
  const { discoverable, canWrite } = useSelector(state => state.report)
  const isViewer = useSelector(state => state.user.isViewer)
  const numRunningQueries = useSelector(state => state.numRunningQueries)
  const dispatch = useDispatch()
  if ((!canWrite && !discoverable) || isViewer) {
    return null
  }
  return (
    <Button
      id='dekart-refresh-button'
      type='text'
      icon={numRunningQueries ? <LoadingOutlined /> : <ReloadOutlined />}
      title='Re-run all queries'
      onClick={() => {
        if (numRunningQueries) {
          return
        }
        dispatch(runAllQueries())
      }}
    />
  )
}

function CreateWorkspaceButton () {
  const history = useHistory()
  return (
    <Tooltip title='Set up a secure space to connect your data, and share live maps with your team.'>
      <Button type='primary' onClick={() => history.push('/workspace')}>Create Workspace</Button>
    </Tooltip>

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
  const userStream = useSelector(state => state.user.stream)
  const workspaceId = userStream?.workspaceId
  const isPlayground = useSelector(state => state.user.isPlayground)

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

  if (!workspaceId && !isPlayground) {
    return (
      <div className={styles.reportHeaderButtons}>
        <CreateWorkspaceButton />
      </div>
    )
  }
}

function goToPresent (history, id) {
  const searchParams = new URLSearchParams(window.location.search)
  history.replace(`/reports/${id}?${searchParams.toString()}`)
}

function EditModeButtons () {
  const dispatch = useDispatch()
  const history = useHistory()
  const { id, canWrite } = useSelector(state => state.report)
  const { saving } = useSelector(state => state.reportStatus)
  const changed = useReportChanged()
  const isViewer = useSelector(state => state.user.isViewer)

  useAutoSave()

  return (
    <div className={styles.reportHeaderButtons}>
      <RefreshButton />
      <Button
        type='text'
        icon={<FullscreenOutlined />}
        disabled={changed && canWrite && !isViewer}
        title='Present Mode'
        onClick={() => goToPresent(history, id)}
      />
      <ExportDropdown />
      <ShareButton />
      {canWrite
        ? (
          <>
            <ForkButton />
            <Button
              id='dekart-save-button'
              title={saving ? 'Saving...' : 'Save this report'}
              type='text'
              ghost
              icon={saving || changed ? <CloudSyncOutlined /> : <CloudOutlined />}
              disabled={saving}
              onClick={() => dispatch(saveMap())}
            />
          </>
          )
        : <ForkButton primary />}
    </div>
  )
}

function ExportDropdown () {
  const dispatch = useDispatch()
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
        dispatch(toggleModal(EXPORT_MAP_ID))
      }
    },
    {
      label: 'Data',
      onClick: () => {
        dispatch(toggleModal(EXPORT_DATA_ID))
      }
    },
    {
      label: 'Image',
      onClick: () => {
        dispatch(toggleModal(EXPORT_IMAGE_ID))
      }
    }
  ]
  return (
    <Dropdown menu={{ items }} placement='topLeft'>
      <Button
        type='text'
        icon={<DownloadOutlined />}
      />
    </Dropdown>
  )
}

// goToSource redirects to the source view while preserving the current query params
function goToSource (history, id) {
  const searchParams = new URLSearchParams(window.location.search)
  history.replace(`/reports/${id}/source?${searchParams.toString()}`)
}

function ViewModeButtons () {
  const history = useHistory()
  const { id, canWrite } = useSelector(state => state.report)
  const userStream = useSelector(state => state.user.stream)
  const workspaceId = userStream?.workspaceId
  const isPlayground = useSelector(state => state.user.isPlayground)

  if (canWrite) {
    return (
      <div className={styles.reportHeaderButtons}>
        <RefreshButton />
        <ExportDropdown />
        <ShareButton />
        <ForkButton />
        <Button
          type='primary'
          disabled={!canWrite}
          icon={<EditOutlined />}
          onClick={() => goToSource(history, id)}
        >Edit
        </Button>
      </div>
    )
  }

  if (!workspaceId && !isPlayground) {
    return (
      <div className={styles.reportHeaderButtons}>
        <CreateWorkspaceButton />
      </div>
    )
  }

  return (
    <div className={styles.reportHeaderButtons}>
      <RefreshButton />
      <Button
        type='text'
        icon={<ConsoleSqlOutlined />}
        onClick={() => goToSource(history, id)}
        title='View SQL source'
      />
      <ExportDropdown />
      <ShareButton />
      <ForkButton primary />
    </div>
  )
}

export default function ReportHeaderButtons ({ edit }) {
  if (edit) {
    return <EditModeButtons />
  }
  return <ViewModeButtons />
}
