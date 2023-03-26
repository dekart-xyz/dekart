import { useEffect, useState } from 'react'
import AceEditor from 'react-ace'
import { AutoSizer } from 'react-virtualized'
import Button from 'antd/es/button'
import styles from './Query.module.css'
import { useDispatch, useSelector } from 'react-redux'
import { cancelQuery, queryChanged, runQuery, showDataTable } from './actions'
import 'ace-builds/src-noconflict/mode-sql'
// import 'ace-builds/src-noconflict/theme-textmate'
import 'ace-builds/src-noconflict/theme-sqlserver'
import 'ace-builds/src-noconflict/ext-language_tools'
import 'ace-builds/webpack-resolver'
import { Query as QueryType } from '../proto/dekart_pb'
import { SendOutlined, CheckCircleTwoTone, ExclamationCircleTwoTone, ClockCircleTwoTone } from '@ant-design/icons'
import { Duration } from 'luxon'
import prettyBites from 'pretty-bytes'
import DataDocumentationLink from './DataDocumentationLink'

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
  const { downloadingResults, datasetId } = useSelector(state => state.queryStatus[query.id])
  if (downloadingResults) {
    return null
  }
  return (
    <Button
      size='small'
      type='ghost'
      onClick={() => dispatch(showDataTable(datasetId))}
    >Show Table
    </Button>
  )
}

function JobTimer ({ query }) {
  const online = useSelector(state => state.reportStatus.online)
  const lastUpdated = useSelector(state => state.reportStatus.lastUpdated)
  const [durationMs, setDuration] = useState(Date.now())
  useEffect(() => {
    let cancel = false
    const iterator = () => {
      if (cancel || !online) {
        return
      }
      setDuration(query.jobDuration + Date.now() - lastUpdated)
      setTimeout(iterator, 1000)
    }
    iterator()
    return () => { cancel = true }
  }, [query.jobDuration, online, lastUpdated])
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

function Processed ({ query }) {
  if (query.bytesProcessed) {
    return (<span className={styles.processed}>({prettyBites(query.bytesProcessed)} processed)</span>)
  } else {
    return (<span className={styles.processed}>(cached)</span>)
  }
}

function QueryEditor ({ queryId, queryText, onChange, canWrite }) {
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
            readOnly={!canWrite}
            editorProps={{ $blockScrolling: true }}
            setOptions={{
              enableBasicAutocompletion: true,
              enableLiveAutocompletion: true,
              enableSnippets: true,
              highlightActiveLine: canWrite,
              highlightGutterLine: canWrite
            }}
          />
        )}
      </AutoSizer>
      {queryText ? null : <DataDocumentationLink className={styles.dataDoc} />}
    </div>
  )
}

function QueryStatus ({ children, query }) {
  let message, errorMessage, action, style
  let icon = null
  if (query.jobError) {
    message = 'Error'
    style = styles.error
    errorMessage = query.jobError
    icon = <ExclamationCircleTwoTone className={styles.icon} twoToneColor='#F66B55' />
  }
  switch (query.jobStatus) {
    case QueryType.JobStatus.JOB_STATUS_PENDING:
      message = 'Pending'
      style = styles.info
      action = <StatusActions query={query} />
      break
    case QueryType.JobStatus.JOB_STATUS_RUNNING:
      icon = <ClockCircleTwoTone className={styles.icon} twoToneColor='#B8B8B8' />
      message = 'Running'
      style = styles.info
      action = <StatusActions query={query} />
      break
    case QueryType.JobStatus.JOB_STATUS_DONE_LEGACY:
      if (!query.jobResultId) {
        message = 'Reading Result'
        style = styles.info
        icon = <ClockCircleTwoTone className={styles.icon} twoToneColor='#B8B8B8' />
        action = <StatusActions query={query} />
        break
      }
      icon = <CheckCircleTwoTone className={styles.icon} twoToneColor='#52c41a' />
      message = <span>Ready <Processed query={query} /></span>
      style = styles.success
      action = <ShowDataTable query={query} />
      break
    case QueryType.JobStatus.JOB_STATUS_READING_RESULTS:
      message = 'Reading Result'
      style = styles.info
      icon = <ClockCircleTwoTone className={styles.icon} twoToneColor='#B8B8B8' />
      action = <StatusActions query={query} />
      break
    case QueryType.JobStatus.JOB_STATUS_DONE:
      icon = <CheckCircleTwoTone className={styles.icon} twoToneColor='#52c41a' />
      message = <span>Ready <Processed query={query} /></span>
      style = styles.success
      action = <ShowDataTable query={query} />
      break
    default:
  }
  return (
    <div className={[styles.queryStatus, style].join(' ')}>
      <div className={styles.status}>
        <div className={styles.statusHead}>
          {icon}
          <div id='dekart-query-status-message' className={styles.message}>{message}</div>
          {action ? <div className={styles.action}>{action}</div> : null}
        </div>
        {errorMessage ? <div className={styles.errorMessage}>{errorMessage}</div> : null}
      </div>
      {children ? <div className={styles.button}>{children}</div> : null}

    </div>
  )
}

export default function Query ({ query }) {
  const { canRun, queryText } = useSelector(state => state.queryStatus[query.id])
  const { canWrite } = useSelector(state => state.report)
  const dispatch = useDispatch()
  return (
    <div key={query.id} className={styles.query}>
      <QueryEditor
        queryId={query.id}
        queryText={queryText}
        onChange={value => dispatch(queryChanged(query.id, value))}
        canWrite={canWrite}
      />
      <QueryStatus query={query}>
        {
          canWrite
            ? (
              <Button
                size='large'
                disabled={!canRun || !queryText}
                icon={<SendOutlined />}
                onClick={() => dispatch(runQuery(query.id, queryText))}
              >Execute
              </Button>
              )
            : null
        }
      </QueryStatus>
    </div>
  )
}
