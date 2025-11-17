import { useState } from 'react'
import Modal from 'antd/es/modal'
import Select from 'antd/es/select'
import { ClockCircleOutlined, SettingOutlined } from '@ant-design/icons'
import Button from 'antd/es/button'
import Tooltip from 'antd/es/tooltip'
import shareStyles from './ShareButton.module.css'

// UX Prototype - No backend integration
// This component manages auto-refresh settings using local state only

const INTERVAL_OPTIONS = [
  { value: 0, label: 'None (disabled)' },
  { value: 60, label: '1 minute' },
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
  { value: 900, label: '15 minutes' },
  { value: 1800, label: '30 minutes' },
  { value: 3600, label: '1 hour' }
]

function ModalContent ({ interval, onIntervalChange }) {
  const intervalLabel = INTERVAL_OPTIONS.find(opt => opt.value === interval)?.label || 'None (disabled)'
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
            ? `When enabled, all queries will automatically re-run every ${intervalLabel.toLowerCase()} when the map is open and visible. You can manually refresh at any time using the refresh button.`
            : 'Auto-refresh is disabled. Queries will only run when you manually refresh. Select an interval to enable auto-refresh.'}
        </div>
      </div>
      <div className={shareStyles.boolStatusControl}>
        <Select
          value={interval}
          onChange={onIntervalChange}
          style={{ minWidth: 130 }}
          options={INTERVAL_OPTIONS}
        />
      </div>
    </div>
  )
}

export function AutoRefreshSettingsModal ({ visible, onClose, onSave, initialInterval }) {
  const [interval, setInterval] = useState(initialInterval || 0) // Default: disabled (0)
  const [loading, setLoading] = useState(false)

  const handleSave = () => {
    setLoading(true)
    onSave({
      enabled: interval > 0,
      intervalSeconds: interval
    })
    // Simulate a small delay for better UX
    setTimeout(() => {
      setLoading(false)
      onClose()
    }, 200)
  }

  const handleCancel = () => {
    // Reset to initial values
    setInterval(initialInterval || 0)
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
            Cancel
          </Button>
          <Button
            type='primary'
            onClick={handleSave}
            loading={loading}
          >
            Save
          </Button>
        </div>
      }
      width={600}
    >
      <ModalContent
        interval={interval}
        onIntervalChange={setInterval}
      />
    </Modal>
  )
}

export default function AutoRefreshSettings ({ canWrite, edit }) {
  const [modalVisible, setModalVisible] = useState(false)
  // UX Prototype: Using local state only (no persistence)
  const [autoRefreshConfig, setAutoRefreshConfig] = useState({
    enabled: false,
    intervalSeconds: 0
  })

  // Handle save - just update local state
  const handleSave = (config) => {
    setAutoRefreshConfig(config)
  }

  // Only show in edit mode for editors
  if (!canWrite || !edit) {
    return null
  }

  return (
    <>
      <Tooltip title='Configure auto refresh settings'>
        <Button
          type='text'
          icon={<SettingOutlined />}
          onClick={() => setModalVisible(true)}
          title='Auto Refresh Settings'
        />
      </Tooltip>
      <AutoRefreshSettingsModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
        initialInterval={autoRefreshConfig.intervalSeconds}
      />
    </>
  )
}

// Export config getter for use in other components
// UX Prototype: Returns default config (no persistence)
export function getAutoRefreshConfig () {
  return { enabled: false, intervalSeconds: 0 }
}
