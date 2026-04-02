import { useCallback, useEffect, useRef, useState } from 'react'
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
import { setActiveDataset } from './actions/dataset'
import { showReadmeTab } from './actions/readme'
import Tooltip from 'antd/es/tooltip'
import { getDatasourceMeta } from './lib/datasource'
import { copyErrorToClipboard } from './actions/clipboard'
import { track } from './lib/tracking'

function CancelButton ({ queryJob }) {
  const dispatch = useDispatch()
  return (
    <Button
      size='small'
      type='ghost'
      onClick={() => {
        track('QueryCancelled', { jobId: queryJob.id })
        dispatch(cancelJob(queryJob.id))
      }}
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

// Parse editor-local tab shortcut: Ctrl+Shift+[1..9] -> 0-based tab index.
function getEditorTabShortcutIndex (event) {
  const hasRequiredModifiers = event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey
  if (!hasRequiredModifiers) {
    return null
  }
  const match = event.code && event.code.match(/^Digit([1-9])$/)
  if (!match) {
    return null
  }
  return Number(match[1]) - 1
}

// Build tab keys in the same order as report tabs.
function getShortcutTabKeys (reportReadme, datasets) {
  const keys = []
  if (reportReadme) {
    keys.push('readme')
  }
  return keys.concat(datasets.map(dataset => dataset.id))
}

// Switch tab from editor shortcut using Redux actions only.
function switchTabFromEditorShortcut ({ tabIndex, reportReadme, datasets, dispatch }) {
  const tabKeys = getShortcutTabKeys(reportReadme, datasets)
  const tabKey = tabKeys[tabIndex]
  if (!tabKey) {
    return
  }
  if (tabKey === 'readme') {
    dispatch(showReadmeTab())
    return
  }
  dispatch(setActiveDataset(tabKey))
}

// Intercept shortcuts before Ace keybindings, so behavior is deterministic.
function registerQueryEditorKeyboardInterceptors ({ editor, getCanExecute, executeQuery, switchTab }) {
  editor.container.addEventListener('keydown', (event) => {
    const tabIndex = getEditorTabShortcutIndex(event)
    if (tabIndex !== null) {
      event.preventDefault()
      event.stopPropagation()
      switchTab(tabIndex)
      return
    }

    const isRunShortcut = (event.metaKey || event.ctrlKey) && event.key === 'Enter'
    if (!isRunShortcut) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (!getCanExecute()) {
      return
    }
    executeQuery()
  }, true)
}

// Focus Ace editor input when query tab becomes active.
function focusAceEditor (editor) {
  if (!editor || typeof editor.focus !== 'function') {
    return
  }
  setTimeout(() => {
    editor.focus()
  }, 0)
}

function QueryEditor ({ queryId, queryText, onChange, canWrite, canExecute, onExecute }) {
  const dataset = useSelector(state => state.dataset.list.find(q => q.queryId === queryId))
  const datasets = useSelector(state => state.dataset.list)
  const connection = useSelector(state => state.connection.list.find(c => c.id === dataset?.connectionId))
  const reportReadme = useSelector(state => state.report.readme)
  const connectionType = useConnectionType(connection?.id)
  const completer = getDatasourceMeta(connectionType)?.completer
  const dispatch = useDispatch()
  const datasetsRef = useRef(datasets)
  const reportReadmeRef = useRef(reportReadme)
  const canExecuteRef = useRef(canExecute)
  const onExecuteRef = useRef(onExecute)
  const editorRef = useRef(null)

  useEffect(() => {
    datasetsRef.current = datasets
  }, [datasets])

  useEffect(() => {
    reportReadmeRef.current = reportReadme
  }, [reportReadme])

  useEffect(() => {
    canExecuteRef.current = canExecute
  }, [canExecute])

  useEffect(() => {
    onExecuteRef.current = onExecute
  }, [onExecute])

  useEffect(() => {
    if (completer) {
      const langTools = window.ace.require('ace/ext/language_tools')
      langTools.addCompleter(completer)
    }
  }, [completer])

  const onEditorLoad = useCallback((editor) => {
    editorRef.current = editor
    registerQueryEditorKeyboardInterceptors({
      editor,
      getCanExecute: () => canExecuteRef.current,
      executeQuery: () => onExecuteRef.current(),
      switchTab: (tabIndex) => switchTabFromEditorShortcut({
        tabIndex,
        reportReadme: reportReadmeRef.current,
        datasets: datasetsRef.current,
        dispatch
      })
    })
    focusAceEditor(editor)
  }, [dispatch])

  useEffect(() => {
    focusAceEditor(editorRef.current)
  }, [queryId])

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
            onLoad={onEditorLoad}
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

  // Track query errors
  useEffect(() => {
    if (queryJob?.jobError) {
      track('QueryError', {
        queryId: query.id,
        uerror: queryJob.jobError?.substring(0, 1000), // User error - SQL error
        jobId: queryJob.id
      })
    }
  }, [queryJob?.jobError, query.id, queryJob?.id])

  // Track query success
  useEffect(() => {
    if (queryJob?.jobStatus === QueryJob.JobStatus.JOB_STATUS_DONE && queryJob.jobResultId) {
      track('QuerySuccess', {
        queryId: query.id,
        jobId: queryJob.id,
        bytesProcessed: queryJob.bytesProcessed
      })
    }
  }, [queryJob?.jobStatus, queryJob?.jobResultId, query.id, queryJob?.id, queryJob?.bytesProcessed])

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
                  onClick={() => {
                    track('CopyErrorToClipboard', { queryId: query.id })
                    dispatch(copyErrorToClipboard(errorMessage))
                  }}
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

export default function Query ({ query }) {
  const { canRun, queryText } = useSelector(state => state.queryStatus[query.id])
  const { canWrite } = useSelector(state => state.report)
  const edit = useSelector(state => state.reportStatus.edit)
  const dispatch = useDispatch()
  const canExecute = canWrite && edit && canRun && queryText
  const executeQuery = useCallback(() => {
    track('QueryExecute', { queryId: query.id })
    dispatch(runQuery(query.id, queryText))
  }, [dispatch, query.id, queryText])

  return (
    <div key={query.id} className={styles.query}>
      <QueryEditor
        queryId={query.id}
        queryText={queryText}
        onChange={value => dispatch(queryChanged(query.id, value))}
        canWrite={canWrite && edit}
        canExecute={canExecute}
        onExecute={executeQuery}
      />
      <QueryStatus query={query}>
        {
          canWrite && edit
            ? (
              <Button
                id='dekart-query-execute-button'
                size='large'
                disabled={!canExecute}
                icon={<SendOutlined />}
                title='Execute query (Cmd/Ctrl+Enter)'
                onClick={executeQuery}
              >Execute
              </Button>
              )
            : null
        }
      </QueryStatus>
    </div>
  )
}
