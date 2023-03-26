import { useHistory } from 'react-router'
import styles from './ReportHeaderButtons.module.css'
import Button from 'antd/es/button'
import { saveMap, forkReport } from './actions'
import { FundProjectionScreenOutlined, EditOutlined, ConsoleSqlOutlined, ForkOutlined } from '@ant-design/icons'
import { useDispatch, useSelector } from 'react-redux'
import ShareButton from './ShareButton'

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

function EditModeButtons ({ changed }) {
  const dispatch = useDispatch()
  const history = useHistory()
  const { id, discoverable, canWrite } = useSelector(state => state.report)
  const { canSave } = useSelector(state => state.reportStatus)

  return (
    <div className={styles.reportHeaderButtons}>
      <Button
        type='text'
        icon={<FundProjectionScreenOutlined />}
        disabled={changed && canWrite}
        title='Present Mode'
        onClick={() => history.replace(`/reports/${id}`)}
      />
      {canWrite
        ? (
          <>
            <ForkButton reportId={id} disabled={!canSave} />
            <Button
              id='dekart-save-button'
              ghost
              disabled={!canSave}
              onClick={() => dispatch(saveMap())}
            >Save{changed ? '*' : ''}
            </Button>
          </>
          )
        : <ForkButton reportId={id} disabled={!canSave} />}
      <ShareButton reportId={id} discoverable={discoverable} canWrite={canWrite} />
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
      <Button
        type='text'
        icon={<ConsoleSqlOutlined />}
        onClick={() => history.replace(`/reports/${id}/source`)}
        title='View SQL source'
      />
      <ForkButton reportId={id} primary disabled={!canSave} />
    </div>
  )
}

export default function ReportHeaderButtons ({ edit, changed }) {
  if (edit) {
    return <EditModeButtons changed={changed} />
  }
  return <ViewModeButtons />
}
