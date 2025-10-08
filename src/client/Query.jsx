import { useEffect, useState } from 'react'
import AceEditor from 'react-ace'
import { AutoSizer } from 'react-virtualized'
import Button from 'antd/es/button'
import styles from './Query.module.css'
import { useDispatch, useSelector } from 'react-redux'
import 'ace-builds/src-noconflict/mode-sql'
import 'ace-builds/src-noconflict/theme-sqlserver'
import 'ace-builds/src-noconflict/ext-language_tools'
import 'ace-builds/src-noconflict/keybinding-vscode'
import 'ace-builds/src-noconflict/ext-beautify'
import 'ace-builds/src-noconflict/ext-emmet'
import { ConnectionType, QueryJob } from 'dekart-proto/dekart_pb'
import { SendOutlined, CheckCircleTwoTone, ExclamationCircleTwoTone, ClockCircleTwoTone, CopyOutlined } from '@ant-design/icons'
import { Duration } from 'luxon'
import DataDocumentationLink from './DataDocumentationLink'
import { cancelJob, queryChanged, runQuery } from './actions/query'
import Tooltip from 'antd/es/tooltip'
import { getDatasourceMeta } from './lib/datasource'
import { copyErrorToClipboard } from './actions/clipboard'

function CancelButton ({ queryJob }) {
  const dispatch = useDispatch()
  return (
    <Button
      size='small'
      type='ghost'
      onClick={() => dispatch(cancelJob(queryJob.id))}
    >Cancel
    </Button>
  )
}

function JobTimer ({ queryJob }) {
  const online = useSelector(state => state.reportStatus.online)
  const lastUpdated = useSelector(state => state.reportStatus.lastUpdated)
  const [durationMs, setDuration] = useState(Date.now())
  useEffect(() => {
    let cancel = false
    const iterator = () => {
      if (cancel || !online) {
        return
      }
      setDuration(queryJob.jobDuration + Date.now() - lastUpdated)
      setTimeout(iterator, 1000)
    }
    iterator()
    return () => { cancel = true }
  }, [queryJob.jobDuration, online, lastUpdated])
  if (!online) {
    return null
  }
  const duration = Duration.fromMillis(durationMs)
  return (<span className={styles.jobTimer}>{duration.toFormat('mm:ss')}</span>)
}

function StatusActions ({ queryJob }) {
  return (
    <span className={styles.statusActions}>
      <JobTimer queryJob={queryJob} />
      <CancelButton queryJob={queryJob} />
    </span>
  )
}

function QueryEditor ({ queryId, queryText, onChange, canWrite }) {
  const dataset = useSelector(state => state.dataset.list.find(q => q.queryId === queryId))
  const connection = useSelector(state => state.connection.list.find(c => c.id === dataset?.connectionId))
  const connectionType = useConnectionType(connection?.id)
  const completer = getDatasourceMeta(connectionType)?.completer
  useEffect(() => {
    if (completer) {
      const langTools = window.ace.require('ace/ext/language_tools')
      langTools.addCompleter(completer)
    }
  }, [completer])

  return (
    <div className={styles.editor}>
      <AutoSizer>
        {({ height, width }) => (
          <AceEditor
            mode='sql'
            width={`${width}px`}
            height={`${height}px`}
            theme='sqlserver'
            name={'AceEditor' + queryId}
            keyboardHandler='vscode'
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
      {queryText && queryText.trim().length ? null : <SampleQuery queryId={queryId} />}
    </div>
  )
}

function QueryStatus ({ children, query }) {
  const hash = useSelector(state => state.queryParams.hash)
  const queryJob = useSelector(state => state.queryJobs.find(job => job.queryId === query.id && job.queryParamsHash === hash))
  let message, errorMessage, action, style
  let icon = null
  const dispatch = useDispatch()

  if (queryJob?.jobError) {
    message = 'Query Error'
    style = styles.error
    errorMessage = queryJob.jobError
    icon = <ExclamationCircleTwoTone className={styles.icon} twoToneColor='#F66B55' />
  }
  switch (queryJob?.jobStatus) {
    case QueryJob.JobStatus.JOB_STATUS_PENDING:
      icon = <ClockCircleTwoTone className={styles.icon} twoToneColor='#B8B8B8' />
      message = 'Pending'
      style = styles.info
      action = <StatusActions queryJob={queryJob} />
      break
    case QueryJob.JobStatus.JOB_STATUS_RUNNING:
      icon = <ClockCircleTwoTone className={styles.icon} twoToneColor='#B8B8B8' />
      message = 'Running'
      style = styles.info
      action = <StatusActions queryJob={queryJob} />
      break
    case QueryJob.JobStatus.JOB_STATUS_DONE_LEGACY:
      if (!queryJob.jobResultId) {
        message = 'Reading Result'
        style = styles.info
        icon = <ClockCircleTwoTone className={styles.icon} twoToneColor='#B8B8B8' />
        action = <StatusActions queryJob={queryJob} />
        break
      }
      icon = <CheckCircleTwoTone className={styles.icon} twoToneColor='#52c41a' />
      message = <span>Ready</span>
      style = styles.success
      break
    case QueryJob.JobStatus.JOB_STATUS_READING_RESULTS:
      message = 'Reading Result'
      style = styles.info
      icon = <ClockCircleTwoTone className={styles.icon} twoToneColor='#B8B8B8' />
      action = <StatusActions queryJob={queryJob} />
      break
    case QueryJob.JobStatus.JOB_STATUS_DONE:
      icon = <CheckCircleTwoTone className={styles.icon} twoToneColor='#52c41a' />
      message = <span>Ready</span>
      style = styles.success
      break
    default:
  }
  return (
    <div className={[styles.queryStatus, style].join(' ')}>
      <div className={styles.status}>
        <div className={styles.statusHead}>
          {icon}
          {errorMessage
            ? (
              <div className={styles.errorMessage}>
                <Button
                  type='text'
                  size='small'
                  icon={<CopyOutlined />}
                  onClick={() => dispatch(copyErrorToClipboard(errorMessage))}
                  className={styles.copyErrorButton}
                  title='Copy error to clipboard'
                />

                <div className={styles.errorMessageContent}>
                  <span id='dekart-query-status-message' className={styles.messageInline}>{message}</span> {errorMessage}
                </div>
              </div>
              )
            : <div id='dekart-query-status-message' className={styles.message}>{message}</div>}
          <div className={styles.spacer} />
          {action ? <div className={styles.action}>{action}</div> : null}
        </div>
      </div>
      {children ? <div className={styles.button}>{children}</div> : null}
    </div>
  )
}

// custom react hook which gets connectionType
function useConnectionType (connectionId) {
  const isPlayground = useSelector(state => state.user.isPlayground)
  const connectionType = useSelector(state => state.connection.list.find(c => c.id === connectionId)?.connectionType)
  return isPlayground ? ConnectionType.CONNECTION_TYPE_BIGQUERY : connectionType
}

function SampleQuery ({ queryId }) {
  const { UX_SAMPLE_QUERY_SQL, UX_DATA_DOCUMENTATION } = useSelector(state => state.env.variables)
  const queryStatus = useSelector(state => state.queryStatus[queryId])
  const dataset = useSelector(state => state.dataset.list.find(q => q.queryId === queryId))
  const connection = useSelector(state => state.connection.list.find(c => c.id === dataset?.connectionId))
  const { DATASOURCE } = useSelector(state => state.env.variables)
  const isPlayground = useSelector(state => state.user.isPlayground)

  let connectionType = connection?.connectionType
  if (isPlayground) {
    // TODO: what if snowflake connection is used in playground?
    connectionType = ConnectionType.CONNECTION_TYPE_BIGQUERY
  }

  const downloadingSource = queryStatus?.downloadingSource
  const dispatch = useDispatch()
  if (UX_DATA_DOCUMENTATION) {
    return <DataDocumentationLink className={styles.dataDoc} />
  }
  if (
    downloadingSource) {
    // do not show sample query while downloading source
    return null
  }
  let showSampleQuery = UX_SAMPLE_QUERY_SQL
  if (!showSampleQuery) {
    if (connection) {
      showSampleQuery = getDatasourceMeta(connection.connectionType)?.sampleQuery
    } else if (DATASOURCE) {
      showSampleQuery = getDatasourceMeta(DATASOURCE)?.sampleQuery
    }
  }
  if (showSampleQuery) {
    return (
      <div className={styles.sampleQuery}>
        <Tooltip title={<>Don't know where to start?<br />Try running public dataset query.</>}>
          <Button
            type='link' onClick={() => {
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

export default function Query ({ query }) {
  const { canRun, queryText } = useSelector(state => state.queryStatus[query.id])
  const { canWrite } = useSelector(state => state.report)
  const edit = useSelector(state => state.reportStatus.edit)
  const dispatch = useDispatch()
  return (
    <div key={query.id} className={styles.query}>
      <QueryEditor
        queryId={query.id}
        queryText={queryText}
        onChange={value => dispatch(queryChanged(query.id, value))}
        canWrite={canWrite && edit}
      />
      <QueryStatus query={query}>
        {
          canWrite && edit
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
