// REVIEW: One rule shared by map readiness and chart readiness, so both agree on which datasets a render may wait for.
import { File } from 'dekart-proto/dekart_pb'
import { DuckDBJobStatus } from './duckdb/constants'

// A render can still add a dataset to the map only from a stored file with a source, or from a query job
// for the current parameters that has not failed on the server or in the browser's DuckDB runtime.
// A finished job that produced no result is not detected here.
export function datasetCanLoad (dataset, files, jobs, localJobs, paramsHash) {
  if (dataset.fileId) {
    return files.some(file => file.id === dataset.fileId && file.fileStatus >= File.Status.STATUS_STORED && Boolean(file.sourceId))
  }
  const job = jobs.find(job => job.queryId === dataset.queryId && job.queryParamsHash === paramsHash)
  return Boolean(dataset.queryId && job && !job.jobError && localJobs[job.id]?.status !== DuckDBJobStatus.DUCKDB_JOB_STATUS_ERROR)
}
