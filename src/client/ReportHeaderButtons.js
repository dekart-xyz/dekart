import { useHistory } from 'react-router'
import styles from './ReportHeaderButtons.module.css'
import Button from 'antd/es/button'
import { FundProjectionScreenOutlined, DownloadOutlined, EditOutlined, ConsoleSqlOutlined, ForkOutlined, ReloadOutlined, LoadingOutlined } from '@ant-design/icons'
import { useDispatch, useSelector } from 'react-redux'
import ShareButton from './ShareButton'
import { forkReport, saveMap } from './actions/report'
import { runAllQueries } from './actions/query'
import { Query } from '../proto/dekart_pb'
import { toggleModal } from '@dekart-xyz/kepler.gl/dist/actions/ui-state-actions'
import { EXPORT_DATA_ID, EXPORT_IMAGE_ID, EXPORT_MAP_ID } from '@dekart-xyz/kepler.gl/dist/constants'
import Dropdown from 'antd/es/dropdown'

function ForkButton ({ reportId, disabled, primary }) {
  const dispatch = useDispatch()
  if (primary) {
    return (
      <Button
        type='primary'
        icon={<ForkOutlined />}
        disabled={disabled}
        onClick={() => dispatch(forkReport(reportId))}
      >Fork
      </Button>
    )
  }
  return (
    <Button
      type='text'
      icon={<ForkOutlined />}
      disabled={disabled}
      onClick={() => dispatch(forkReport(reportId))}
      id='dekart-fork-button'
      title='Fork Report'
    />
  )
}

function RefreshButton () {
  const { discoverable, canWrite } = useSelector(state => state.report)
  const queries = useSelector(state => state.queries)
  const loadingNumber = queries.reduce((loadingNumber, q) => {
    switch (q.jobStatus) {
      case Query.JobStatus.JOB_STATUS_PENDING:
      case Query.JobStatus.JOB_STATUS_RUNNING:
      case Query.JobStatus.JOB_STATUS_READING_RESULTS:
        return loadingNumber + 1
      default:
        return loadingNumber
    }
  }, 0)
  const completedQueries = queries.reduce((n, q) => {
    switch (q.jobStatus) {
      case Query.JobStatus.JOB_STATUS_DONE:
        return n + 1
      default:
        return n
    }
  }, 0)
  const dispatch = useDispatch()
  if (completedQueries === 0 && loadingNumber === 0) {
    return null
  }
  if (!canWrite && !discoverable) {
    return null
  }
  return (
    <Button
      id='dekart-refresh-button'
      type='text'
      icon={loadingNumber ? <LoadingOutlined /> : <ReloadOutlined />}
      title='Re-run all queries'
      onClick={() => {
        if (loadingNumber) {
          return
        }
        dispatch(runAllQueries())
      }}
    />
  )
}

function EditModeButtons ({ changed }) {
  const dispatch = useDispatch()
  const history = useHistory()
  const { id, discoverable, canWrite, allowEdit, isAuthor, isPlayground } = useSelector(state => state.report)
  const userStream = useSelector(state => state.user.stream)
  const { canSave } = useSelector(state => state.reportStatus)

  return (
    <div className={styles.reportHeaderButtons}>
      <RefreshButton />
      <Button
        type='text'
        icon={<FundProjectionScreenOutlined />}
        disabled={changed && canWrite}
        title='Present Mode'
        onClick={() => history.replace(`/reports/${id}`)}
      />
      <ExportDropdown />
      <ShareButton reportId={id} discoverable={discoverable} isAuthor={isAuthor} allowEdit={allowEdit} />
      {canWrite
        ? (
          <>
            <ForkButton reportId={id} disabled={!canSave} />
            <Button
              id='dekart-save-button'
              type={changed ? 'primary' : 'default'}
              ghost
              disabled={!canSave}
              onClick={() => dispatch(saveMap())}
            >Save{changed ? '*' : ''}
            </Button>
          </>
          )
        : <ForkButton reportId={id} disabled={!canSave || (isPlayground && !userStream?.isPlayground)} />}
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

function ViewModeButtons () {
  const history = useHistory()
  const { id, discoverable, canWrite, allowEdit, isAuthor, isPlayground } = useSelector(state => state.report)
  const userStream = useSelector(state => state.user.stream)
  const { canSave } = useSelector(state => state.reportStatus)
  if (canWrite) {
    return (
      <div className={styles.reportHeaderButtons}>
        <RefreshButton />
        <ExportDropdown />
        <ShareButton reportId={id} discoverable={discoverable} isAuthor={isAuthor} allowEdit={allowEdit} />
        <ForkButton reportId={id} disabled={!canSave} />
        <Button
          type='primary'
          disabled={!canWrite}
          icon={<EditOutlined />}
          onClick={() => history.replace(`/reports/${id}/source`)}
        >Edit
        </Button>

      </div>
    )
  }
  return (
    <div className={styles.reportHeaderButtons}>
      <RefreshButton />
      <Button
        type='text'
        icon={<ConsoleSqlOutlined />}
        onClick={() => history.replace(`/reports/${id}/source`)}
        title='View SQL source'
      />
      <ExportDropdown />
      <ShareButton reportId={id} discoverable={discoverable} isAuthor={isAuthor} allowEdit={allowEdit} />
      <ForkButton reportId={id} disabled={!canSave || (isPlayground && !userStream?.isPlayground)} />
    </div>
  )
}

export default function ReportHeaderButtons ({ edit, changed }) {
  if (edit) {
    return <EditModeButtons changed={changed} />
  }
  return <ViewModeButtons />
}
