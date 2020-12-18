import { useParams } from 'react-router-dom'
import { Button } from 'antd'
import AceEditor from 'react-ace'
import debounce from 'lodash.debounce'

import 'ace-builds/src-noconflict/mode-sql'
import 'ace-builds/src-noconflict/theme-textmate'
import 'ace-builds/src-noconflict/ext-language_tools'
import 'ace-builds/webpack-resolver'
import { useEffect, useState } from 'react'
import { get, post, patch } from './lib/api'

async function loadQuery (setQueryText, reportID, setQueryId) {
  const res = await get(`/report/${reportID}`)
  const { report } = await res.json()
  if (report.queries && report.queries.length) {
    console.log(report.queries)
    const query = report.queries[0]
    setQueryId(query.id)
    setQueryText(query.queryText || '')
  } else {
    await post(`/report/${reportID}/query`, { query: { queryText: '' } })
    return loadQuery(setQueryText, reportID)
  }
  // {console.log(report)}
  // if (report.quer)
}

function saveQuery (queryId, queryText) {
  return patch(`/query/${queryId}`, { query: { queryText } })
}

const saveQueryOnChange = debounce((queryId, queryText) => {
  console.log('saveQueryOnChange', queryId)
  saveQuery(queryId, queryText).catch(console.error)
}, 1000)

function onQueryChange (queryText, setQueryText, queryId) {
  setQueryText(queryText)
  if (queryId) {
    saveQueryOnChange(queryId, queryText)
  }
}

export default function ReportPage () {
  const { id } = useParams()
  const [queryText, setQueryText] = useState('')
  const [queryId, setQueryId] = useState(null)
  useEffect(() => loadQuery(
    setQueryText, id, setQueryId
  ).catch(console.error), [id])
  return (
    <div>
      <div>Report {id}</div>
      <AceEditor
        mode='sql'
        theme='textmate'
        // onChange={onChange}
        name='UNIQUE_ID_OF_DIV'
        onChange={value => onQueryChange(value, setQueryText, queryId)}
        value={queryText}
        editorProps={{ $blockScrolling: true }}
        setOptions={{
          enableBasicAutocompletion: true,
          enableLiveAutocompletion: true,
          enableSnippets: true
        }}
      />
      <div>
        <Button>Save</Button>
        <Button>Run</Button>
      </div>
    </div>
  )
}
