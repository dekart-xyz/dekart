import { useState, useMemo, useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import Modal from 'antd/es/modal'
import Button from 'antd/es/button'
import Collapse from 'antd/es/collapse'
import { HistoryOutlined, UserOutlined, ClockCircleOutlined, DownOutlined, RollbackOutlined, EditOutlined, DatabaseOutlined, FileTextOutlined } from '@ant-design/icons'
import Tag from 'antd/es/tag'
import { DateTime } from 'luxon'
import styles from './MapChangeHistoryModal.module.css'
import { getSnapshots, toggleSnapshotModal } from './actions/snapshots'
import { restoreReportSnapshot } from './actions/report'
import { Loading } from './Loading'
import { ReportSnapshot } from 'dekart-proto/dekart_pb'

const { Panel } = Collapse

// Format date for display using luxon
function formatDate (date) {
  const dateOnly = DateTime.fromJSDate(date).startOf('day')
  const today = DateTime.local().startOf('day')
  const yesterday = today.minus({ days: 1 })

  const dateISO = dateOnly.toISODate()
  if (dateISO === today.toISODate()) {
    return 'Today'
  } else if (dateISO === yesterday.toISODate()) {
    return 'Yesterday'
  }

  return dateOnly
    .setLocale('en-US')
    .toLocaleString({ weekday: 'long', month: 'long', day: 'numeric' })
}

function formatTime (date) {
  return DateTime.fromJSDate(date)
    .setLocale('en-US')
    .toLocaleString({
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })
}

function formatHour (date) {
  return DateTime.fromJSDate(date)
    .setLocale('en-US')
    .toFormat('h a')
}

// Render tag based on trigger type
function renderChangeTypeTag (triggerType) {
  switch (triggerType) {
    case ReportSnapshot.TriggerType.TRIGGER_TYPE_SNAPSHOT_RESTORE:
      return (
        <Tag icon={<RollbackOutlined />} color='orange' className={styles.typeTag}>
          Restore
        </Tag>
      )
    case ReportSnapshot.TriggerType.TRIGGER_TYPE_QUERY_CHANGE:
      return (
        <Tag icon={<DatabaseOutlined />} color='purple' className={styles.typeTag}>
          Query Change
        </Tag>
      )
    case ReportSnapshot.TriggerType.TRIGGER_TYPE_DATASET_CHANGE:
      return (
        <Tag icon={<DatabaseOutlined />} color='cyan' className={styles.typeTag}>
          Dataset Change
        </Tag>
      )
    case ReportSnapshot.TriggerType.TRIGGER_TYPE_REPORT_CHANGE:
      return (
        <Tag icon={<EditOutlined />} color='blue' className={styles.typeTag}>
          Map Edit
        </Tag>
      )
    case ReportSnapshot.TriggerType.TRIGGER_TYPE_UNSPECIFIED:
    default:
      return (
        <Tag icon={<FileTextOutlined />} color='default' className={styles.typeTag}>
          Change
        </Tag>
      )
  }
}

// Group changes by day, then by hour
function groupChangesByTime (changes) {
  const grouped = {}

  changes.forEach(change => {
    const dateKey = formatDate(change.timestamp)
    const hour = change.timestamp.getHours()
    const hourKey = `${dateKey}-${hour}`

    if (!grouped[dateKey]) {
      grouped[dateKey] = {}
    }

    if (!grouped[dateKey][hourKey]) {
      grouped[dateKey][hourKey] = {
        hour,
        changes: []
      }
    }

    grouped[dateKey][hourKey].changes.push(change)
  })

  return grouped
}

function DaySection ({ dayLabel, hourGroups, expandedKeys, onToggle, currentVersionId, renderedHours, onHourRendered, onRestore }) {
  const restoring = useSelector(state => state.snapshots.restoring)
  const hourKeys = Object.keys(hourGroups).sort((a, b) => {
    // Sort by hour, descending (newest first)
    return hourGroups[b].hour - hourGroups[a].hour
  })

  const handleToggle = (keys) => {
    // Track which hours have been expanded for lazy rendering
    keys.forEach(key => {
      if (!renderedHours.has(key)) {
        onHourRendered(key)
      }
    })
    onToggle(keys)
  }

  return (
    <div className={styles.daySection}>
      <Collapse
        ghost
        activeKey={expandedKeys}
        onChange={handleToggle}
        expandIcon={({ isActive }) => <DownOutlined rotate={isActive ? 180 : 0} />}
        className={styles.hourCollapse}
      >
        {hourKeys.map(hourKey => {
          const hourGroup = hourGroups[hourKey]
          const hourLabel = formatHour(new Date(2024, 0, 1, hourGroup.hour))
          const changes = hourGroup.changes.sort((a, b) => b.timestamp - a.timestamp)
          const isExpanded = expandedKeys.includes(hourKey)
          const hasBeenRendered = renderedHours.has(hourKey)
          // Render if expanded OR if it has been rendered before (lazy render, but keep after first render)
          const shouldRender = isExpanded || hasBeenRendered

          return (
            <Panel
              key={hourKey}
              header={
                <div className={styles.hourHeader}>
                  <ClockCircleOutlined className={styles.hourIcon} />
                  <span className={styles.hourLabel}>{hourLabel}</span>
                  <span className={styles.hourChangeCount}>{changes.length} change{changes.length !== 1 ? 's' : ''}</span>
                </div>
              }
              className={styles.hourPanel}
            >
              {shouldRender && (
                <div className={styles.changesList}>
                  {changes.map(change => (
                    <div key={change.id} className={`${styles.changeItem} ${change.id === currentVersionId ? styles.currentVersion : ''}`}>
                      <div className={styles.changeTime}>{formatTime(change.timestamp)}</div>
                      <div className={styles.changeContent}>
                        <div className={styles.changeTypeBadge}>
                          {renderChangeTypeTag(change.triggerType)}
                        </div>
                        <div className={styles.changeUser}>
                          <UserOutlined className={styles.userIcon} />
                          {change.user}
                        </div>
                      </div>
                      <Button
                        type='text'
                        size='small'
                        icon={<RollbackOutlined />}
                        className={styles.restoreButton}
                        disabled={restoring}
                        onClick={() => onRestore(change.id)}
                      >
                        Restore
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )
        })}
      </Collapse>
    </div>
  )
}

export function MapChangeHistoryModal () {
  const dispatch = useDispatch()
  const { data: snapshots, loading } = useSelector(state => state.snapshots || {})
  const report = useSelector(state => state.report)
  const open = useSelector(state => state.snapshots.open)
  const [expandedHours, setExpandedHours] = useState(new Set())
  const [renderedHours, setRenderedHours] = useState(new Set())
  const prevOpenRef = useRef(false)

  // Always reload snapshots when modal is opened
  useEffect(() => {
    if (open && !prevOpenRef.current && report?.id) {
      // Modal just opened - always reload data
      dispatch(getSnapshots())
    }
    prevOpenRef.current = open

    // Reset UI state when modal closes
    if (!open && prevOpenRef.current) {
      setExpandedHours(new Set())
      setRenderedHours(new Set())
    }
  }, [open, report?.id, dispatch])

  // Build history data from snapshots
  const historyData = useMemo(() => {
    if (!snapshots) return []
    const reportSnapshotsList = snapshots.reportSnapshotsList || []

    // Map raw snapshots into change objects while preserving original order (no additional sorting)
    return reportSnapshotsList
      .filter(s => s && s.createdAt)
      .map(s => {
        const ts = new Date(s.createdAt)
        if (Number.isNaN(ts.getTime())) {
          return null
        }
        return {
          id: s.versionId,
          timestamp: ts,
          user: s.authorEmail,
          triggerType: s.triggerType
        }
      })
      .filter(Boolean)
  }, [snapshots])

  const groupedData = useMemo(() => groupChangesByTime(historyData), [historyData])

  // Current version comes from the report
  const currentVersionId = report?.versionId || (historyData.length > 0 ? historyData[0].id : null)

  const dayLabels = Object.keys(groupedData).sort((a, b) => {
    // Sort: Today first, then Yesterday, then by date
    if (a === 'Today') return -1
    if (b === 'Today') return 1
    if (a === 'Yesterday') return -1
    if (b === 'Yesterday') return 1
    return 0
  })

  // Auto-expand today by default
  const defaultExpandedDays = useMemo(() => {
    if (dayLabels.length > 0 && dayLabels[0] === 'Today') {
      return new Set(['Today'])
    }
    return new Set()
  }, [dayLabels])

  const [currentExpandedDays, setCurrentExpandedDays] = useState(defaultExpandedDays)

  const handleRestore = (versionId) => {
    dispatch(restoreReportSnapshot(versionId))
  }

  return (
    <Modal
      title={
        <div className={styles.modalTitle}>
          <HistoryOutlined className={styles.titleIcon} />
          <span>Map Change History</span>
        </div>
      }
      open={open}
      onCancel={() => dispatch(toggleSnapshotModal(false))}
      footer={null}
      width={700}
      className={styles.modal}
      bodyStyle={{ padding: '0px' }}
    >
      <div className={styles.content}>
        {loading && !snapshots && (
          <Loading />
        )}
        {!loading && historyData.length === 0 && (
          <div className={styles.summary}>
            <span className={styles.totalChanges}>No changes yet</span>
          </div>
        )}
        {!loading && historyData.length > 0 && (
          <>
            <div className={styles.summary}>
              <span className={styles.totalChanges}>{historyData.length} total changes</span>
            </div>

            <div className={styles.historyContainer}>
              <Collapse
                ghost
                activeKey={Array.from(currentExpandedDays)}
                onChange={(keys) => setCurrentExpandedDays(new Set(keys))}
                expandIcon={({ isActive }) => <DownOutlined rotate={isActive ? 180 : 0} />}
                className={styles.dayCollapse}
              >
                {dayLabels.map(dayLabel => {
                  const hourGroups = groupedData[dayLabel]
                  const totalChanges = Object.values(hourGroups).reduce((sum, hg) => sum + hg.changes.length, 0)

                  return (
                    <Panel
                      key={dayLabel}
                      header={
                        <div className={styles.dayPanelHeader}>
                          <span className={styles.dayPanelLabel}>{dayLabel}</span>
                          <span className={styles.dayPanelCount}>{totalChanges} change{totalChanges !== 1 ? 's' : ''}</span>
                        </div>
                      }
                      className={styles.dayPanel}
                    >
                      <DaySection
                        dayLabel={dayLabel}
                        hourGroups={hourGroups}
                        expandedKeys={Array.from(expandedHours).filter(key => key.startsWith(dayLabel))}
                        currentVersionId={currentVersionId}
                        renderedHours={renderedHours}
                        onRestore={handleRestore}
                        onHourRendered={(hourKey) => {
                          setRenderedHours(prev => new Set([...prev, hourKey]))
                        }}
                        onToggle={(keys) => {
                          const newExpanded = new Set()
                          keys.forEach(key => {
                            if (key.startsWith(dayLabel)) {
                              newExpanded.add(key)
                            }
                          })
                          // Keep other expanded hours
                          expandedHours.forEach(key => {
                            if (!key.startsWith(dayLabel)) {
                              newExpanded.add(key)
                            }
                          })
                          setExpandedHours(newExpanded)
                        }}
                      />
                    </Panel>
                  )
                })}
              </Collapse>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

export default MapChangeHistoryModal
