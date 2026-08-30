import { File } from 'dekart-proto/dekart_pb'
import getDatasetName from '../getDatasetName'
import { DuckDBJobStatus } from './constants'

const DUCKDB_FALLBACK_QUERY = `SELECT
    random() * 180 - 90 AS latitude,
    random() * 360 - 180 AS longitude
FROM range(100);`
const DUCKDB_DATASET_IDENTIFIER = /datasets\.(?:"(?:[^"]|"")*|[\w$]*)$/i

// Return report sources whose labels can be addressed unambiguously by DuckDB.
export function getDuckDBSources (datasets, files, currentDatasetId) {
  const sources = datasets.map(dataset => ({
    dataset,
    label: getDatasetName(dataset, datasets, files)
  }))
  const labelCounts = sources.reduce((counts, source) => {
    counts.set(source.label, (counts.get(source.label) || 0) + 1)
    return counts
  }, new Map())

  return sources.filter(({ dataset, label }) =>
    dataset.id !== currentDatasetId &&
    (dataset.queryId || dataset.fileId) &&
    labelCounts.get(label) === 1
  )
}

// Quote a report label as a DuckDB SQL identifier.
export function quoteDuckDBIdentifier (label) {
  return `"${label.replaceAll('"', '""')}"`
}

// Install report-aware DuckDB completion with Ace defaults on one editor.
export function registerDuckDBCompleter (editor, getSources) {
  const langTools = window.ace.require('ace/ext/language_tools')
  const previousCompleters = editor.completers
  const completer = {
    getCompletions (editor, session, pos, prefix, callback) {
      callback(null, getSources().map(({ label }) => ({
        caption: label,
        value: quoteDuckDBIdentifier(label),
        completer,
        meta: 'dataset'
      })))
    },
    insertMatch (editor, completion) {
      const pos = editor.getCursorPosition()
      const beforeCursor = editor.session.getLine(pos.row).slice(0, pos.column)
      const identifierLength = beforeCursor.match(DUCKDB_DATASET_IDENTIFIER)?.[0].slice('datasets.'.length).length || 0
      editor.session.replace({
        start: { row: pos.row, column: pos.column - identifierLength },
        end: pos
      }, completion.value)
    }
  }
  const defaultCompleters = [
    langTools.snippetCompleter,
    langTools.textCompleter,
    langTools.keyWordCompleter
  ]
  editor.completers = defaultCompleters

  // Switch to dataset suggestions only while the cursor is inside an unfinished identifier.
  const syncCompletionContext = () => {
    const pos = editor.getCursorPosition()
    const beforeCursor = editor.session.getLine(pos.row).slice(0, pos.column)
    editor.completers = DUCKDB_DATASET_IDENTIFIER.test(beforeCursor) ? [completer] : defaultCompleters
    // Reopen completion at the exact trigger so stale native suggestions disappear.
    if (/datasets\.$/i.test(beforeCursor)) {
      editor.completer?.detach()
      // Keep an empty source catalog from reopening the previous popup contents.
      if (getSources().length) {
        setTimeout(() => editor.execCommand('startAutocomplete'), 0)
      }
    }
  }
  editor.selection.on('changeCursor', syncCompletionContext)
  return () => {
    editor.selection.off('changeCursor', syncCompletionContext)
    editor.completer?.detach()
    editor.completers = previousCompleters
  }
}

// Pick the first source whose current revision can be pinned and is not known to have failed.
export function getDuckDBSampleQuery ({ sources, files, queryJobs, queryParamsHash, duckDBJobStates }) {
  const source = sources.find(({ dataset }) => {
    // Files are pinnable only after permanent storage confirms completion.
    if (dataset.fileId) {
      return files.find(file => file.id === dataset.fileId)?.fileStatus === File.Status.STATUS_STORED
    }
    const job = queryJobs.find(job =>
      job.queryId === dataset.queryId && job.queryParamsHash === queryParamsHash
    )
    // Empty and canonically failed queries cannot provide a usable revision.
    if (!job || job.jobError) {
      return false
    }
    return duckDBJobStates[job.id]?.status !== DuckDBJobStatus.DUCKDB_JOB_STATUS_ERROR
  })
  // Keep the example runnable even when the report has no usable source.
  if (!source) {
    return DUCKDB_FALLBACK_QUERY
  }
  return `SELECT *
FROM datasets.${quoteDuckDBIdentifier(source.label)}
LIMIT 100;`
}
