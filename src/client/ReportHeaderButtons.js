import { useHistory } from 'react-router'
import styles from './ReportHeaderButtons.module.css'
import Button from 'antd/es/button'
import { FundProjectionScreenOutlined, EditOutlined, ConsoleSqlOutlined, ForkOutlined, ReloadOutlined, LoadingOutlined } from '@ant-design/icons'
import { useDispatch, useSelector } from 'react-redux'
import ShareButton from './ShareButton'
import { forkReport, saveMap } from './actions/report'
import { runAllQueries } from './actions/query'
import { Query } from '../proto/dekart_pb'

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
  const { id, discoverable, canWrite, allowEdit, isAuthor } = useSelector(state => state.report)
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
        : <ForkButton reportId={id} disabled={!canSave} />}
    </div>
  )
}

function ViewModeButtons () {
  const history = useHistory()
  const { id, canWrite } = useSelector(state => state.report)
  const { canSave } = useSelector(state => state.reportStatus)
  if (canWrite) {
    return (
      <div className={styles.reportHeaderButtons}>
        <RefreshButton />
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
      <ForkButton reportId={id} disabled={!canSave} />
    </div>
  )
}

export default function ReportHeaderButtons ({ edit, changed }) {
  if (edit) {
    return <EditModeButtons changed={changed} />
  }
  return <ViewModeButtons />
}
