import { useParams } from 'react-router-dom'
import { Button } from 'antd'
import AceEditor from 'react-ace'

import 'ace-builds/src-noconflict/mode-sql'
import 'ace-builds/src-noconflict/theme-textmate'
import 'ace-builds/src-noconflict/ext-language_tools'
import 'ace-builds/webpack-resolver'
import { useEffect, useReducer, useState } from 'react'
import { createQuery, getReportStream, runQuery, updateQuery } from './lib/grpc'
import { Query } from '../proto/dekart_pb'
import KeplerGl from 'kepler.gl'

function reducer (state, action) {
  if (action.queriesList) {
    return {
      queries: action.queriesList
    }
  }
  if (action.queryId) {
    return {
      queries: state.queries.map(query => {
        if (query.id === action.queryId) {
          query.queryText = action.queryText
        }
        return query
      })
    }
  }
  return state
}

export default function ReportPage () {
  const { id } = useParams()
  // const [queryText, setQueryText] = useState('')
  // const [queryId, setQueryId] = useState(null)
  const [state, dispatch] = useReducer(reducer, {
    queries: null
  })
  useEffect(() => {
    return getReportStream(id, ({ report, queriesList }) => {
      dispatch({ queriesList })
    })
  }, [id])
  let queriesSection
  if (state.queries && state.queries.length) {
    const queriesSections = state.queries.map(query => {
      return (
        <div key={query.id}>
          <AceEditor
            mode='sql'
            theme='textmate'
            // onChange={onChange}
            name='UNIQUE_ID_OF_DIV'
            onChange={value => {
              dispatch({ queryId: query.id, queryText: value })
            }}
            value={query.queryText}
            editorProps={{ $blockScrolling: true }}
            setOptions={{
              enableBasicAutocompletion: true,
              enableLiveAutocompletion: true,
              enableSnippets: true
            }}
          />
          <div>Status {Object.keys(Query.JobStatus).find(key => Query.JobStatus[key] === query.jobStatus)}</div>
          <div>
            <Button onClick={() => updateQuery(query.id, query.queryText).catch(console.error)}>Save</Button>
            <Button onClick={() => runQuery(query.id).catch(console.error)}>Run</Button>
          </div>
        </div>
      )
    })
    console.log(process.env.REACT_APP_MAPBOX_TOKEN)

    queriesSection = (
      <div>
        {queriesSections}
        <KeplerGl
          id='kepler'
          mapboxApiAccessToken={process.env.REACT_APP_MAPBOX_TOKEN}
          width={800}
          height={800}
        />
      </div>
    )
  } else {
    queriesSection = (
      <div>
        <Button onClick={() => createQuery(id).catch(console.error)}>Add Query</Button>
      </div>
    )
  }
  return (
    <div>
      <div>Report {id}</div>
      {queriesSection}
    </div>
  )
}
