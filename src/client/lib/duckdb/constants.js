import { QueryExecutionEngine } from 'dekart-proto/dekart_pb'

export const DUCKDB_DATASOURCE = 'DUCKDB'

export const DuckDBJobStatus = {
  DUCKDB_JOB_STATUS_WAITING_FOR_SOURCES: 'waiting',
  DUCKDB_JOB_STATUS_RUNNING: 'running',
  DUCKDB_JOB_STATUS_READY: 'ready',
  DUCKDB_JOB_STATUS_ERROR: 'error'
}

export function isDuckDBQuery (query) {
  return query?.executionEngine === QueryExecutionEngine.QUERY_EXECUTION_ENGINE_DUCKDB
}

export function isDuckDBDataset (dataset, queries) {
  return isDuckDBQuery(queries.find(query => query.id === dataset?.queryId))
}

export function duckDBViewName (datasetId) {
  return `d_${datasetId.replaceAll('-', '_')}`
}
