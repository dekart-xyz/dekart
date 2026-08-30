import Button from 'antd/es/button'
import Tooltip from 'antd/es/tooltip'
import { ConnectionType } from 'dekart-proto/dekart_pb'
import { useDispatch, useSelector } from 'react-redux'
import DataDocumentationLink from './DataDocumentationLink'
import styles from './Query.module.css'
import { queryChanged } from './actions/query'
import { DUCKDB_DATASOURCE, isDuckDBQuery } from './lib/duckdb/constants'
import { getDuckDBSampleQuery, getDuckDBSources } from './lib/duckdb/datasets'
import { getDatasourceMeta } from './lib/datasource'
import { track } from './lib/tracking'

// Render the documentation, runnable sample, or examples link for an empty query editor.
export default function SampleQuery ({ queryId }) {
  const { UX_SAMPLE_QUERY_SQL, UX_DATA_DOCUMENTATION } = useSelector(state => state.env.variables)
  const queryStatus = useSelector(state => state.queryStatus[queryId])
  const dataset = useSelector(state => state.dataset.list.find(q => q.queryId === queryId))
  const query = useSelector(state => state.queries.find(query => query.id === queryId))
  const connection = useSelector(state => state.connection.list.find(c => c.id === dataset?.connectionId))
  const { DATASOURCE } = useSelector(state => state.env.variables)
  const isPlayground = useSelector(state => state.user.isPlayground)
  const datasets = useSelector(state => state.dataset.list)
  const files = useSelector(state => state.files)
  const queryJobs = useSelector(state => state.queryJobs)
  const queryParamsHash = useSelector(state => state.queryParams.hash)
  const duckDBJobStates = useSelector(state => state.duckDBJobStates)

  let connectionType = isDuckDBQuery(query) ? DUCKDB_DATASOURCE : connection?.connectionType ?? dataset?.connectionType
  if (isPlayground && !isDuckDBQuery(query)) {
    // TODO: what if snowflake connection is used in playground?
    connectionType = ConnectionType.CONNECTION_TYPE_BIGQUERY
  }

  const downloadingSource = queryStatus?.downloadingSource
  const dispatch = useDispatch()
  if (UX_DATA_DOCUMENTATION) {
    return <DataDocumentationLink className={styles.dataDoc} />
  }
  // Do not show a sample query while its source is downloading.
  if (downloadingSource) {
    return null
  }
  let showSampleQuery = UX_SAMPLE_QUERY_SQL
  if (!showSampleQuery) {
    // DuckDB samples depend on the current report sources and job readiness.
    if (connectionType === DUCKDB_DATASOURCE) {
      showSampleQuery = getDuckDBSampleQuery({
        sources: getDuckDBSources(datasets, files, dataset?.id),
        files,
        queryJobs,
        queryParamsHash,
        duckDBJobStates
      })
    } else {
      showSampleQuery = getDatasourceMeta(connectionType)?.sampleQuery
    }
    if (!showSampleQuery && DATASOURCE) {
      showSampleQuery = getDatasourceMeta(DATASOURCE)?.sampleQuery
    }
  }
  if (showSampleQuery) {
    return (
      <div className={styles.sampleQuery}>
        <Tooltip title={<>Don't know where to start?<br />Try running public dataset query.</>}>
          <Button
            type='link' onClick={() => {
              track('SampleQueryClicked', { queryId })
              dispatch(queryChanged(queryId, showSampleQuery))
            }}
          >💡 Start with a sample query
          </Button>
        </Tooltip>
      </div>
    )
  }
  const examplesUrl = getDatasourceMeta(connectionType)?.examplesUrl
  if (examplesUrl) {
    return (
      <div className={styles.sampleQuery}>
        <Tooltip title={<>Don't know where to start?<br />Try running public dataset query.</>}>
          <a
            href={examplesUrl}
            target='_blank'
            rel='noreferrer'
          >💡 Start with public dataset query
          </a>
        </Tooltip>
      </div>
    )
  }
  return null
}
