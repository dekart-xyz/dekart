import { useMemo } from 'react'
import { useSelector } from 'react-redux'
import { QueryJob } from 'dekart-proto/dekart_pb'
import { DuckDBJobStatus, isDuckDBDataset } from './duckdb/constants'

const runningJobStatuses = [
  QueryJob.JobStatus.JOB_STATUS_PENDING,
  QueryJob.JobStatus.JOB_STATUS_RUNNING,
  QueryJob.JobStatus.JOB_STATUS_READING_RESULTS
]

const finishedDuckDBJobStatuses = [
  DuckDBJobStatus.DUCKDB_JOB_STATUS_READY,
  DuckDBJobStatus.DUCKDB_JOB_STATUS_ERROR
]

// Combines shared query jobs with this browser's local DuckDB activity.
export function useQueriesRunning () {
  const datasets = useSelector(state => state.dataset.list)
  const queries = useSelector(state => state.queries)
  const duckDBJobStates = useSelector(state => state.duckDBJobStates)
  const queryJobs = useSelector(state => state.queryJobs)
  const queryParamsHash = useSelector(state => state.queryParams.hash)
  const runAllQueriesPending = useSelector(state => state.runAllQueriesPending)
  const queryExecutionsPending = useSelector(state => state.queryExecutionsPending)

  return useMemo(() => {
    if (runAllQueriesPending || Object.keys(queryExecutionsPending).length > 0) {
      return true
    }
    const duckDBQueryIds = new Set(
      datasets.filter(dataset => isDuckDBDataset(dataset, queries)).map(dataset => dataset.queryId)
    )

    return queryJobs.some(job => {
      const isDuckDBJob = duckDBQueryIds.has(job.queryId)
      return job.queryParamsHash === queryParamsHash && (
        runningJobStatuses.includes(job.jobStatus) ||
        (
          isDuckDBJob &&
          job.jobStatus === QueryJob.JobStatus.JOB_STATUS_DONE &&
          !finishedDuckDBJobStatuses.includes(duckDBJobStates[job.id]?.status)
        )
      )
    })
  }, [datasets, duckDBJobStates, queries, queryExecutionsPending, queryJobs, queryParamsHash, runAllQueriesPending])
}
