import { useEffect, useState } from 'react'
import AceEditor from 'react-ace'
import { AutoSizer } from 'react-virtualized'
import Button from 'antd/es/button'
import styles from './Query.module.css'
import { useDispatch, useSelector } from 'react-redux'
import 'ace-builds/src-noconflict/mode-sql'
import 'ace-builds/src-noconflict/theme-sqlserver'
import 'ace-builds/src-noconflict/ext-language_tools'
import 'ace-builds/webpack-resolver'
import { Connection, Query as QueryType } from '../proto/dekart_pb'
import { SendOutlined, CheckCircleTwoTone, ExclamationCircleTwoTone, ClockCircleTwoTone } from '@ant-design/icons'
import { Duration } from 'luxon'
import DataDocumentationLink from './DataDocumentationLink'
import { cancelQuery, queryChanged, runQuery } from './actions/query'
import Tooltip from 'antd/es/tooltip'
import { switchPlayground } from './actions/user'
import { getDatasourceMeta } from './lib/datasource'

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
      {queryText && queryText.trim().length ? null : <SampleQuery queryId={queryId} />}
    </div>
  )
}

function PlaygroundWarning ({ jobError }) {
  const isPlayground = useSelector(state => state.user.isPlayground)
  const dispatch = useDispatch()
  let showPlaygroundWarning = false
  if (jobError && jobError.includes('Error 40') && isPlayground) {
    showPlaygroundWarning = true
  }
  if (!showPlaygroundWarning) {
    return null
  }
  return (
    <div className={styles.playgroundWarning}>
      <p>You are in Playground Mode. To access private datasets create free workspace and configure connection</p>
      <Button type='link' onClick={() => dispatch(switchPlayground(false))}>Switch to workspace</Button>
    </div>
  )
}

function QueryStatus ({ children, query }) {
  const env = useSelector(state => state.env)
  let message, errorMessage, action, style, tooltip, errorInfoHtml
  let icon = null
  if (query.jobError) {
    message = 'Error'
    style = styles.error
    errorMessage = query.jobError
    if (env.variables.UX_ACCESS_ERROR_INFO_HTML && errorMessage.includes('Error 403')) {
      errorInfoHtml = ''
    } else if (env.variables.UX_NOT_FOUND_ERROR_INFO_HTML && errorMessage.includes('Error 404')) {
      errorInfoHtml = env.variables.UX_NOT_FOUND_ERROR_INFO_HTML
    }
    icon = <ExclamationCircleTwoTone className={styles.icon} twoToneColor='#F66B55' />
  }
  switch (query.jobStatus) {
    case QueryType.JobStatus.JOB_STATUS_PENDING:
      icon = <ClockCircleTwoTone className={styles.icon} twoToneColor='#B8B8B8' />
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
      message = <span>Ready</span>
      style = styles.success
      break
    case QueryType.JobStatus.JOB_STATUS_READING_RESULTS:
      message = 'Reading Result'
      style = styles.info
      icon = <ClockCircleTwoTone className={styles.icon} twoToneColor='#B8B8B8' />
      action = <StatusActions query={query} />
      break
    case QueryType.JobStatus.JOB_STATUS_DONE:
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
          <Tooltip title={tooltip} className={styles.tooltip}>
            {icon}
            <div id='dekart-query-status-message' className={styles.message}>{message}</div>
          </Tooltip>
          <div className={styles.spacer} />
          {action ? <div className={styles.action}>{action}</div> : null}
        </div>
        {errorMessage ? <div className={styles.errorMessage}>{errorMessage}</div> : null}
        {errorInfoHtml ? <div className={styles.errorInfoHtml} dangerouslySetInnerHTML={{ __html: errorInfoHtml }} /> : null}
        <PlaygroundWarning jobError={query.jobError} />
      </div>
      {children ? <div className={styles.button}>{children}</div> : null}

    </div>
  )
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
    connectionType = Connection.ConnectionType.CONNECTION_TYPE_BIGQUERY
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
