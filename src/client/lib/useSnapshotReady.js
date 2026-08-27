import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import { SNAPSHOT_TOKEN_TYPE } from '../actions/token'
import { DuckDBJobStatus, isDuckDBDataset } from './duckdb/constants'

// useSnapshotReady computes snapshot auth/data/basemap readiness flags from redux state.
export function useSnapshotReady (snapshot, reportId, snapshotBasemapReady) {
  const report = useSelector(state => state.report)
  const token = useSelector(state => state.token)
  const envLoaded = useSelector(state => state.env.loaded)
  const reportStatus = useSelector(state => state.reportStatus)
  const datasetCount = useSelector(state => (state.dataset.list || []).length)
  const downloadingCount = useSelector(state => (state.dataset.downloading || []).length)
  const duckDBReady = useSelector(state => {
    const keplerDatasets = state.keplerGl.kepler?.visState.datasets || {}
    return (state.dataset.list || [])
      .filter(dataset => isDuckDBDataset(dataset, state.queries))
      .every(dataset => {
        const queryJob = state.queryJobs.find(job =>
          job.queryId === dataset.queryId &&
          job.queryParamsHash === state.queryParams.hash
        )
        // Missing and shared-invalid jobs do not block an error/empty snapshot forever.
        if (!queryJob || queryJob.jobError) {
          return true
        }
        const duckDBJobState = state.duckDBJobStates[queryJob.id]
        // A locally completed error is a terminal snapshot state.
        if (duckDBJobState?.status === DuckDBJobStatus.DUCKDB_JOB_STATUS_ERROR) {
          return true
        }
        // Success is ready only after this canonical job published this exact Kepler dataset.
        return duckDBJobState?.status === DuckDBJobStatus.DUCKDB_JOB_STATUS_READY &&
          duckDBJobState.datasetId === dataset.id &&
          Boolean(keplerDatasets[dataset.id])
      })
  })
  const snapshotToken = snapshot ? (token?.access_token || '') : ''
  const authReady = !snapshot || (token?.token_type === SNAPSHOT_TOKEN_TYPE)
  const dataReady = Boolean(
    snapshot &&
    report?.id === reportId &&
    reportStatus.online &&
    (reportStatus.dataAdded || datasetCount === 0) &&
    downloadingCount === 0 &&
    duckDBReady
  )
  const reportDepsReady = envLoaded && (!snapshot || authReady)
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
