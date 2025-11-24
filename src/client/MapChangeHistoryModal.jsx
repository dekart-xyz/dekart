import { useState, useMemo } from 'react'
import Modal from 'antd/es/modal'
import Button from 'antd/es/button'
import Collapse from 'antd/es/collapse'
import { HistoryOutlined, UserOutlined, ClockCircleOutlined, DownOutlined, RollbackOutlined, EditOutlined } from '@ant-design/icons'
import Tag from 'antd/es/tag'
import styles from './MapChangeHistoryModal.module.css'

const { Panel } = Collapse

// Mock data generator - creates changes over the past few days
function generateMockHistoryData () {
  const now = new Date()
  const changes = []
  const users = ['alice.johnson@example.com', 'bob.smith@example.com', 'carol.williams@example.com', 'david.brown@example.com', 'eve.davis@example.com']

  // Generate changes for the past 3 days
  for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
    const day = new Date(now)
    day.setDate(day.getDate() - dayOffset)
    day.setHours(0, 0, 0, 0)

    // Generate 5-15 changes per day
    const changesPerDay = Math.floor(Math.random() * 11) + 5
    for (let i = 0; i < changesPerDay; i++) {
      const changeTime = new Date(day)
      // Distribute changes throughout the day
      const hour = Math.floor(Math.random() * 24)
      const minute = Math.floor(Math.random() * 60)
      changeTime.setHours(hour, minute, 0, 0)

      // Don't create future dates
      if (changeTime > now) continue

      // Randomly assign type: 'edit' or 'restore' (more edits than restores)
      const changeType = Math.random() > 0.2 ? 'edit' : 'restore'

      changes.push({
        id: `change-${dayOffset}-${i}`,
        timestamp: changeTime,
        user: users[Math.floor(Math.random() * users.length)],
        type: changeType
      })
    }
  }

  // Sort by timestamp, newest first
  return changes.sort((a, b) => b.timestamp - a.timestamp)
}

// Format date for display
function formatDate (date) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (dateOnly.getTime() === today.getTime()) {
    return 'Today'
  } else if (dateOnly.getTime() === yesterday.getTime()) {
    return 'Yesterday'
  } else {
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  }
}

function formatTime (date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function formatHour (date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })
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

function DaySection ({ dayLabel, hourGroups, expandedKeys, onToggle, currentVersionId, renderedHours, onHourRendered }) {
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
                          {change.type === 'restore'
                            ? (
                              <Tag icon={<RollbackOutlined />} color='orange' className={styles.typeTag}>
                                Restore
                              </Tag>
                              )
                            : (
                              <Tag icon={<EditOutlined />} color='blue' className={styles.typeTag}>
                                Map Edit
                              </Tag>
                              )}
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
                        onClick={() => {
                          // TODO: Implement restore functionality
                          console.log('Restore to:', change.id, change.timestamp)
                        }}
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

export function MapChangeHistoryModal ({ open, onClose }) {
  const [expandedHours, setExpandedHours] = useState(new Set())
  const [renderedHours, setRenderedHours] = useState(new Set())

  // Generate and group mock data
  const historyData = useMemo(() => generateMockHistoryData(), [])
  const groupedData = useMemo(() => groupChangesByTime(historyData), [historyData])

  // Current version is the most recent change (first in sorted list)
  const currentVersionId = historyData.length > 0 ? historyData[0].id : null

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

  return (
    <Modal
      title={
        <div className={styles.modalTitle}>
          <HistoryOutlined className={styles.titleIcon} />
          <span>Map Change History</span>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={
        <div className={styles.modalFooter}>
          <div className={styles.modalFooterSpacer} />
          <Button onClick={onClose}>
            Close
          </Button>
        </div>
      }
      width={700}
      className={styles.modal}
      bodyStyle={{ padding: '0px' }}
    >
      <div className={styles.content}>
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
      </div>
    </Modal>
  )
}

export default MapChangeHistoryModal
