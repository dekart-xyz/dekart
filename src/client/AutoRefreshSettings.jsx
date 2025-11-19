import { useState, useEffect } from 'react'
import Modal from 'antd/es/modal'
import Select from 'antd/es/select'
import { ClockCircleOutlined, PauseOutlined } from '@ant-design/icons'
import Button from 'antd/es/button'
import shareStyles from './ShareButton.module.css'
import { setAutoRefreshIntervalSeconds } from './actions/report'
import { useDispatch, useSelector } from 'react-redux'
import { track } from './lib/tracking'
import { goToPresent } from './lib/navigation'
import { useHistory } from 'react-router-dom/cjs/react-router-dom'

const INTERVAL_OPTIONS = [
  { value: 0, label: 'None' },
  // { value: 5, label: '5 seconds' },
  // { value: 10, label: '10 seconds' },
  { value: 60, label: '1 minute' },
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
  { value: 900, label: '15 minutes' },
  { value: 1800, label: '30 minutes' },
  { value: 3600, label: '1 hour' }
]

function ModalContent ({ interval, onIntervalChange, loading, edit }) {
  const intervalLabel = INTERVAL_OPTIONS.find(opt => opt.value === interval)?.label || 'None'
  const isEnabled = interval > 0
  const history = useHistory()
  const { id: reportId } = useSelector(state => state.report)

  return (
    <>
      {isEnabled && edit && (
        <div className={shareStyles.boolStatus} style={{ backgroundColor: '#fffbe6' }}>
          <div className={shareStyles.boolStatusIcon}>
            <PauseOutlined />
          </div>
          <div className={shareStyles.boolStatusLabel}>
            <div className={shareStyles.statusLabelTitle}>Auto-refresh is paused in edit mode</div>
            <div className={shareStyles.statusLabelDescription}>Auto-refresh will resume when you switch to view mode.</div>
          </div>
          <div className={shareStyles.boolStatusControl}>
            <Button onClick={() => goToPresent(history, reportId)}>View Mode</Button>
          </div>
        </div>
      )}
      <div className={shareStyles.boolStatus}>
        <div className={shareStyles.boolStatusIcon}>
          <ClockCircleOutlined />
        </div>
        <div className={shareStyles.boolStatusLabel}>
          <div className={shareStyles.statusLabelTitle}>Refresh Interval</div>
          <div className={shareStyles.statusLabelDescription}>
            {isEnabled
              ? `Queries will automatically re-run every ${intervalLabel.toLowerCase()} when the map is in view mode.`
              : 'Auto-refresh is disabled. Select an interval to enable auto-refresh.'}
          </div>
        </div>
        <div className={shareStyles.boolStatusControl}>
          <Select
            value={interval}
            onChange={onIntervalChange}
            style={{ minWidth: 130 }}
            options={INTERVAL_OPTIONS}
            disabled={loading}
            loading={loading}
          />
        </div>
      </div>
    </>
  )
}

export function AutoRefreshSettingsModal ({ visible, onClose }) {
  const autoRefreshIntervalSeconds = useSelector(state => state.report?.autoRefreshIntervalSeconds)
  const [refreshInterval, setRefreshInterval] = useState(autoRefreshIntervalSeconds)
  const dispatch = useDispatch()
  const reportId = useSelector(state => state.report.id)
  const edit = useSelector(state => state.reportStatus.edit)
  const loading = autoRefreshIntervalSeconds !== refreshInterval

  useEffect(() => {
    if (visible) {
      setRefreshInterval(autoRefreshIntervalSeconds || 0)
      track('OpenAutoRefreshSettingsModal')
    }
  }, [visible, autoRefreshIntervalSeconds])

  const handleCancel = () => {
    onClose()
  }

  return (
    <Modal
      title='Auto Refresh Settings'
      visible={visible}
      onCancel={handleCancel}
      bodyStyle={{ padding: '0px' }}
      footer={
        <div className={shareStyles.modalFooter}>
          <div className={shareStyles.modalFooterSpacer} />
          <Button
            onClick={handleCancel}
          >
            Close
          </Button>
        </div>
      }
      width={600}
    >
      <ModalContent
        interval={refreshInterval}
        loading={loading}
        edit={edit}
        onIntervalChange={(value) => {
          setRefreshInterval(value)
          track('AutoRefreshIntervalChanged')
          dispatch(setAutoRefreshIntervalSeconds(reportId, value))
        }}
      />
    </Modal>
  )
}
