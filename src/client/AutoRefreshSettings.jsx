import { useState, useEffect } from 'react'
import Modal from 'antd/es/modal'
import Select from 'antd/es/select'
import { ClockCircleOutlined } from '@ant-design/icons'
import Button from 'antd/es/button'
import shareStyles from './ShareButton.module.css'
import { setAutoRefreshIntervalSeconds } from './actions/report'
import { useDispatch, useSelector } from 'react-redux'

// Auto-refresh settings component
// Changes are saved immediately via setAutoRefreshIntervalSeconds action

const INTERVAL_OPTIONS = [
  { value: 0, label: 'None' },
  { value: 5, label: '5 seconds' },
  { value: 10, label: '10 seconds' },
  { value: 60, label: '1 minute' },
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
  { value: 900, label: '15 minutes' },
  { value: 1800, label: '30 minutes' },
  { value: 3600, label: '1 hour' }
]

function ModalContent ({ interval, onIntervalChange, loadding }) {
  const intervalLabel = INTERVAL_OPTIONS.find(opt => opt.value === interval)?.label || 'None'
  const isEnabled = interval > 0

  return (
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
          disabled={loadding}
          loading={loadding}
        />
      </div>
    </div>
  )
}

export function AutoRefreshSettingsModal ({ visible, onClose }) {
  const autoRefreshIntervalSeconds = useSelector(state => state.report?.autoRefreshIntervalSeconds)
  const [interval, setInterval] = useState(autoRefreshIntervalSeconds)
  const dispatch = useDispatch()
  const reportId = useSelector(state => state.report.id)
  const loadding = autoRefreshIntervalSeconds !== interval

  useEffect(() => {
    if (visible) {
      setInterval(autoRefreshIntervalSeconds || 0)
    }
  }, [visible, autoRefreshIntervalSeconds, setInterval])

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
        interval={interval}
        loadding={loadding}
        onIntervalChange={(value) => {
          setInterval(value)
          dispatch(setAutoRefreshIntervalSeconds(reportId, value))
        }}
      />
    </Modal>
  )
}
