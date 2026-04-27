import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import { SNAPSHOT_TOKEN_TYPE } from '../actions/token'

// useSnapshotReady computes snapshot auth/data/basemap readiness flags from redux state.
export function useSnapshotReady (snapshot, reportId, snapshotBasemapReady) {
  const report = useSelector(state => state.report)
  const token = useSelector(state => state.token)
  const envLoaded = useSelector(state => state.env.loaded)
  const reportStatus = useSelector(state => state.reportStatus)
  const datasetCount = useSelector(state => (state.dataset.list || []).length)
  const downloadingCount = useSelector(state => (state.dataset.downloading || []).length)
  const snapshotToken = snapshot ? (token?.access_token || '') : ''
  const authReady = !snapshot || (token?.token_type === SNAPSHOT_TOKEN_TYPE)
  const dataReady = Boolean(
    snapshot &&
    report?.id === reportId &&
    reportStatus.online &&
    (reportStatus.dataAdded || datasetCount === 0) &&
    downloadingCount === 0
  )
  const reportDepsReady = snapshot ? authReady : envLoaded
  // why: wait for report data/layers + basemap style readiness before rendering snapshot.
  const snapshotReady = Boolean(snapshot && dataReady && snapshotBasemapReady)
  useEffect(() => {
    if (!snapshot) {
      return
    }
    window.__dekartSnapshotReadyToken = snapshotReady ? snapshotToken : ''
    return () => {
      delete window.__dekartSnapshotReadyToken
    }
  }, [snapshot, snapshotReady, snapshotToken])
  return { reportDepsReady, snapshotReady }
}
