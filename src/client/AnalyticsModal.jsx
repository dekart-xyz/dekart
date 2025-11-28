import Button from 'antd/es/button'
import Modal from 'antd/es/modal'
import styles from './AnalyticsModal.module.css'
import { useDispatch, useSelector } from 'react-redux'
import { getAnalyticsData, setAnalyticsModalOpen } from './actions/analytics'
import Statistic from 'antd/es/statistic'
import { UserOutlined } from '@ant-design/icons'
import { get } from './lib/api'
import { useEffect, useRef, useState } from 'react'
import { setError } from './actions/message'
import Skeleton from 'antd/es/skeleton'
import { track } from './lib/tracking'
import { showUpgradeModal, UpgradeModalType } from './actions/upgradeModal'

export default function AnalyticsModal () {
  const { modalOpen, data: analytics } = useSelector(state => state.analytics)
  const userStream = useSelector(state => state.user.stream)
  const dispatch = useDispatch()
  const report = useSelector(state => state.report)
  const token = useSelector(state => state.token)
  const buttonRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const hasAllFeatures = useSelector(state => state.user.hasAllFeatures)
  const isFreemium = useSelector(state => state.user.isFreemium)

  useEffect(() => {
    if (!userStream || !report.id || !modalOpen) {
      return
    }
    dispatch(getAnalyticsData())
  }, [report.id, userStream, dispatch, modalOpen])

  useEffect(() => {
    if (!analytics || !userStream || !modalOpen || !hasAllFeatures) {
      return
    }
    setLoading(true)
    get(`/report/${report.id}/analytics.csv`, token).then(response => response.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        const a = buttonRef.current
        a.href = url
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        a.download = `dekart-report-viewers-${report.id}-${timestamp}.csv`
        setLoading(false)
      }).catch(err => {
        dispatch(setError(err))
        setLoading(false)
      })
  }, [modalOpen, analytics, userStream, dispatch, token, hasAllFeatures, report.id])

  if (!userStream) {
    return null
  }

  return (
    <Modal
      title='Viewer Analytics'
      open={modalOpen}
      onCancel={() => dispatch(setAnalyticsModalOpen(false))}
      footer={null}
      width={500}
    >
      {
        analytics
          ? (
            <div className={styles.modalContent}>
              <div className={styles.stats}>
                <div className={styles.statsColumn}>
                  <Statistic title='Last 24 hours' value={analytics.viewers24h} prefix={<UserOutlined />} />
                </div>
                <div className={styles.statsColumn}>
                  <Statistic title='Last 7 days' value={analytics.viewers7d} prefix={<UserOutlined />} />
                </div>
                <div className={styles.statsColumn}>
                  <Statistic title='All time' value={analytics.viewersTotal} prefix={<UserOutlined />} />
                </div>
              </div>
              <div className={styles.downloadButton}>
                <Button
                  loading={loading} type='primary' ref={buttonRef} href='#' disabled={loading} onClick={() => {
                    if (isFreemium) {
                      dispatch(showUpgradeModal(UpgradeModalType.ANALYTICS))
                    } else {
                      track('DownloadAnalyticsCSV', { reportId: report.id })
                    }
                  }}
                >Download CSV
                </Button>
              </div>
            </div>
            )
          : (
            <div className={styles.modalContent}>
              <Skeleton
                active
                title={false} paragraph={
                { rows: 3 }
              }
              />
            </div>
            )
      }
    </Modal>
  )
}
