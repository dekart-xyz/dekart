import { useEffect, useState } from 'react'
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
import { DateTime, Duration } from 'luxon'

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

function JobTimer ({ query }) {
  const online = useSelector(state => state.reportStatus.online)
  const [durationMs, setDuration] = useState(Date.now())
  useEffect(() => {
    const start = Date.now()
    let cancel = false
    const iterator = () => {
      if (cancel || !online) {
        return
      }
      setDuration(query.jobDuration + Date.now() - start)
      setTimeout(iterator, 1000)
    }
    iterator()
    return () => { cancel = true }
  }, [query.jobDuration])
  if (!online) {
    return null
  }
  const duration = Duration.fromMillis(durationMs)
  return (<span className={styles.jobTimer}>{duration.toFormat('mm:ss')}</span>)
}

function StatusActions ({ query }) {
  return (
    <span className={styles.statusActions}>
      <JobTimer query={query} />
      <CancelButton query={query} />
    </span>
  )
}

function QueryAlert ({ query }) {
  if (query.jobError) {
    return <Alert message='Error' description={query.jobError} type='error' />
  }
  switch (query.jobStatus) {
    case QueryType.JobStatus.JOB_STATUS_PENDING:
      return <Alert message='Pending' type='info' action={<StatusActions query={query} />} />
    case QueryType.JobStatus.JOB_STATUS_RUNNING:
      return <Alert message='Running' type='info' action={<StatusActions query={query} />} />
    case QueryType.JobStatus.JOB_STATUS_DONE:
      if (!query.jobResultId) {
        return <Alert message='Reading Result' type='info' action={<StatusActions query={query} />} />
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
