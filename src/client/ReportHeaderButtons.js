import { useHistory } from 'react-router'
import styles from './ReportHeaderButtons.module.css'
import Button from 'antd/es/button'
import { saveMap, forkReport } from './actions'
import { FundProjectionScreenOutlined, EditOutlined, ConsoleSqlOutlined, ForkOutlined } from '@ant-design/icons'
import { useDispatch } from 'react-redux'
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
      title='Fork Report'
    />
  )
}

export default function ReportHeaderButtons ({ edit, changed, canSave, reportId, canWrite, discoverable }) {
  const dispatch = useDispatch()
  const history = useHistory()
  if (edit) {
    return (
      <div className={styles.reportHeaderButtons}>
        <Button
          type='text'
          icon={<FundProjectionScreenOutlined />}
          disabled={changed && canWrite}
          title='Present Mode'
          onClick={() => history.replace(`/reports/${reportId}`)}
        />
        {canWrite
          ? (
            <>
              <ForkButton reportId={reportId} disabled={!canSave} />
              <Button
                ghost
                disabled={!canSave}
                onClick={() => dispatch(saveMap())}
              >Save{changed ? '*' : ''}
              </Button>
            </>
            )
          : <ForkButton reportId={reportId} disabled={!canSave} />}
        <ShareButton reportId={reportId} discoverable={discoverable} canWrite={canWrite} />
        {/* <CopyLinkButton /> */}
      </div>
    )
  }
  if (canWrite) {
    return (
      <div className={styles.reportHeaderButtons}>
        <ForkButton reportId={reportId} disabled={!canSave} />
        <Button
          type='primary'
          disabled={!canWrite}
          icon={<EditOutlined />}
          onClick={() => history.replace(`/reports/${reportId}/source`)}
        >Edit
        </Button>
        {/* <CopyLinkButton /> */}
      </div>
    )
  }
  return (
    <div className={styles.reportHeaderButtons}>
      <Button
        type='text'
        icon={<ConsoleSqlOutlined />}
        onClick={() => history.replace(`/reports/${reportId}/source`)}
        title='View SQL source'
      />
      <ForkButton reportId={reportId} primary disabled={!canSave} />
      {/* <CopyLinkButton /> */}
    </div>
  )
}
