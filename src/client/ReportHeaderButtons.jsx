import { useHistory } from 'react-router'
import styles from './ReportHeaderButtons.module.css'
import Button from 'antd/es/button'
import { EyeOutlined, DownloadOutlined, CloudOutlined, EditOutlined, ForkOutlined, ReloadOutlined, LoadingOutlined, CloudSyncOutlined } from '@ant-design/icons'
import { useDispatch, useSelector } from 'react-redux'
import ShareButton from './ShareButton'
import { forkReport, saveMap } from './actions/report'
import { runAllQueries } from './actions/query'
import { toggleModal } from '@kepler.gl/actions/dist/ui-state-actions'
import { EXPORT_DATA_ID, EXPORT_IMAGE_ID, EXPORT_MAP_ID } from '@kepler.gl/constants'
import Dropdown from 'antd/es/dropdown'
import { useEffect } from 'react'
import { ForkOnboarding, useRequireOnboarding } from './ForkOnboarding'
import Select from 'antd/es/select'
import { track } from './lib/tracking'

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
      >Fork this Map
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
      title={disabled ? 'Forking is disabled for viewers' : 'Fork this Map'}
    />
  )
}

function RefreshButton () {
  const { discoverable, canWrite } = useSelector(state => state.report)
  const isViewer = useSelector(state => state.user.isViewer)
  const numRunningQueries = useSelector(state => state.numRunningQueries)
  const numQueries = useSelector(state => state.queries.length)
  const dispatch = useDispatch()
  if ((!canWrite && !discoverable) || isViewer || numQueries === 0) {
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
        track('RefreshAllQueries')
        dispatch(runAllQueries())
      }}
    />
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

function goToPresent (history, id) {
  const searchParams = new URLSearchParams(window.location.search)
  history.replace(`/reports/${id}?${searchParams.toString()}`)
}

function EditModeButtons () {
  const dispatch = useDispatch()
  const { canWrite } = useSelector(state => state.report)
  const { saving } = useSelector(state => state.reportStatus)
  const changed = useReportChanged()

  useAutoSave()

  const requireOnboarding = useRequireOnboarding()

  if (requireOnboarding) {
    return (
      <div className={styles.reportHeaderButtons}>
        <ForkOnboarding requireOnboarding={requireOnboarding} edit />
      </div>
    )
  }

  return (
    <div className={styles.reportHeaderButtons}>
      <RefreshButton />
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
            <ForkButton primary />
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

// goToSource redirects to the source view while preserving the current query params
function goToSource (history, id) {
  const searchParams = new URLSearchParams(window.location.search)
  history.replace(`/reports/${id}/source?${searchParams.toString()}`)
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

  const requireOnboarding = useRequireOnboarding()

  if (requireOnboarding) {
    return (
      <div className={styles.reportHeaderButtons}>
        <ForkOnboarding requireOnboarding={requireOnboarding} />
      </div>
    )
  }

  if (canWrite) {
    return (
      <div className={styles.reportHeaderButtons}>
        <RefreshButton />
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
      <ForkButton />
      <ShareButton />
    </div>
  )
}

export default function ReportHeaderButtons ({ edit }) {
  if (edit) {
    return <EditModeButtons />
  }
  return <ViewModeButtons />
}
