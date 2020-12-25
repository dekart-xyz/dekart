import { useState } from 'react'
import AceEditor from 'react-ace'
import { AutoSizer } from 'react-virtualized'
import { Alert, Button } from 'antd'
import styles from './Query.module.css'
import { useDispatch, useSelector } from 'react-redux'
import { runQuery, updateQuery } from './actions'
import 'ace-builds/src-noconflict/mode-sql'
import 'ace-builds/src-noconflict/theme-textmate'
import 'ace-builds/src-noconflict/ext-language_tools'
import 'ace-builds/webpack-resolver'
import { Query as QueryType } from '../proto/dekart_pb'

function getAlert (query, downloadingResults) {
  if (query.jobError) {
    return <Alert message='BigQuery Job Error' description={query.jobError} type='error' />
  }
  if (downloadingResults) {
    return <Alert message='Downloading Job Results' type='info' />
  }
  switch (query.jobStatus) {
    case QueryType.JobStatus.JOB_STATUS_PENDING:
      return <Alert message='BigQuery Job Pending' type='info' />
    case QueryType.JobStatus.JOB_STATUS_RUNNING:
      return <Alert message='BigQuery Job Running' type='info' />
    case QueryType.JobStatus.JOB_STATUS_DONE:
      if (!query.jobResultId) {
        return <Alert message='Reading Job Result from BigQuery' type='info' />
      }
      return <Alert message='Showing Results' type='success' />
    default:
      return null
  }
}

export default function Query ({ query }) {
  const [queryText, setQueryText] = useState(query.queryText)
  const { canRun, downloadingResults } = useSelector(state => state.queryStatus[query.id])
  // console.log('canRun', canRun)
  const dispatch = useDispatch()
  return (
    <div key={query.id} className={styles.query}>
      <div className={styles.editor}>
        <AutoSizer>
          {({ height, width }) => (
            <AceEditor
              mode='sql'
              width={`${width}px`}
              height={`${height}px`}
              theme='textmate'
              name={'AceEditor' + query.id}
              onChange={value => setQueryText(value)}
              value={queryText}
              editorProps={{ $blockScrolling: true }}
              setOptions={{
                enableBasicAutocompletion: true,
                enableLiveAutocompletion: true,
                enableSnippets: true
              }}
            />
          )}
        </AutoSizer>
      </div>
      {/* <div>Status {Object.keys(QueryType.JobStatus).find(key => QueryType.JobStatus[key] === query.jobStatus)}</div> */}
      <div className={styles.actions}>
        <div className={styles.status}>
          {getAlert(query, downloadingResults)}
        </div>
        <div className={styles.button}>
          <Button
            onClick={() => dispatch(updateQuery(query.id, queryText))}
          >Save
          </Button>
        </div>
        <div className={styles.button}>
          <Button
            type='primary'
            disabled={!canRun}
            onClick={() => dispatch(runQuery(query.id))}
          >Execute
          </Button>
        </div>
      </div>
    </div>
  )
}
