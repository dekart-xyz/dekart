import { useState } from 'react'
import AceEditor from 'react-ace'
import { AutoSizer } from 'react-virtualized'
import Alert from 'antd/es/alert'
import Button from 'antd/es/button'
import styles from './Query.module.css'
import { useDispatch, useSelector } from 'react-redux'
import { cancelQuery, runQuery, showDataTable } from './actions'
import 'ace-builds/src-noconflict/mode-sql'
// import 'ace-builds/src-noconflict/theme-textmate'
import 'ace-builds/src-noconflict/theme-sqlserver'
import 'ace-builds/src-noconflict/ext-language_tools'
import 'ace-builds/webpack-resolver'
import { Query as QueryType } from '../proto/dekart_pb'
import { SendOutlined } from '@ant-design/icons'

function CancelButton ({ query }) {
  const dispatch = useDispatch()
  return (
    <Button
      size='small'
      type='ghost'
      onClick={() => dispatch(cancelQuery(query.id))}
    >Cancel
    </Button>
  )
}
function ShowDataTable ({ query }) {
  const dispatch = useDispatch()
  const { downloadingResults } = useSelector(state => state.queryStatus[query.id])
  if (downloadingResults) {
    return null
  }
  return (
    <Button
      size='small'
      type='ghost'
      onClick={() => dispatch(showDataTable(query))}
    >Show Data Table
    </Button>
  )
}
function QueryAlert ({ query }) {
  if (query.jobError) {
    return <Alert message='BigQuery Job Error' description={query.jobError} type='error' />
  }
  switch (query.jobStatus) {
    case QueryType.JobStatus.JOB_STATUS_PENDING:
      return <Alert message='BigQuery Job Pending' type='info' action={<CancelButton query={query} />} />
    case QueryType.JobStatus.JOB_STATUS_RUNNING:
      return <Alert message='BigQuery Job Running' type='info' action={<CancelButton query={query} />} />
    case QueryType.JobStatus.JOB_STATUS_DONE:
      if (!query.jobResultId) {
        return <Alert message='Reading Job Result from BigQuery' type='info' action={<CancelButton query={query} />} />
      }
      return (
        <Alert
          message='Ready'
          type='success'
          showIcon
          action={<ShowDataTable query={query} />}
        />
      )
    default:
      return null
  }
}

function QueryEditor ({ queryId, queryText, onChange }) {
  return (
    <div className={styles.editor}>
      <AutoSizer>
        {({ height, width }) => (
          <AceEditor
            mode='sql'
            width={`${width}px`}
            height={`${height}px`}
            // theme='textmate'
            theme='sqlserver'
            name={'AceEditor' + queryId}
            onChange={onChange}
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
  )
}

export default function Query ({ query }) {
  const [queryText, setQueryText] = useState(query.queryText)
  const { canRun/*, downloadingResults */ } = useSelector(state => state.queryStatus[query.id])
  const dispatch = useDispatch()
  return (
    <div key={query.id} className={styles.query}>
      <QueryEditor queryId={query.id} queryText={queryText} onChange={value => setQueryText(value)} />
      <div className={styles.actions}>
        <div className={styles.status}>
          <QueryAlert query={query} /* downloadingResults={downloadingResults} */ />
        </div>
        <div className={styles.button}>
          <Button
            size='large'
            disabled={!canRun}
            icon={<SendOutlined />}
            onClick={() => dispatch(runQuery(query.id, queryText))}
          >Execute
          </Button>
        </div>
      </div>
    </div>
  )
}
