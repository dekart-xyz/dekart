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
import styles from './ReportPage.module.css'
import { AutoSizer } from 'react-virtualized'

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
    const cancelable = getReportStream(id, ({ queriesList }) => {
      dispatch({ queriesList })
    })
    return cancelable.cancel
  }, [id])
  let queriesSection
  if (state.queries && state.queries.length) {
    const queriesSections = state.queries.map(query => {
      return (
        <div key={query.id} className={styles.query}>
          <div className={styles.editor}>
            <AutoSizer>
              {({ height, width }) => (
                <AceEditor
                  mode='sql'
                  width={width}
                  height={height}
                  theme='textmate'
          // onChange={onChange}
                  name={'AceEditor' + query.id}
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
              )}
            </AutoSizer>
          </div>
          <div>Status {Object.keys(Query.JobStatus).find(key => Query.JobStatus[key] === query.jobStatus)}</div>
          <div className={styles.buttons}>
            <Button onClick={() => updateQuery(query.id, query.queryText).catch(console.error)}>Save</Button>
            <Button onClick={() => runQuery(query.id).catch(console.error)}>Run</Button>
          </div>
        </div>
      )
    })
    queriesSection = (
      <div className={styles.querySection}>{queriesSections}</div>
    )
  } else {
    queriesSection = (
      <div className={styles.querySection}>
        <Button onClick={() => createQuery(id).catch(console.error)}>Add Query</Button>
      </div>
    )
  }
  return (
    <div className={styles.root}>
      <div className={styles.keplerFlex}>
        <div className={styles.keplerBlock}>
          {/* <KeplerGl
            id='kepler'
            mapboxApiAccessToken={process.env.REACT_APP_MAPBOX_TOKEN}
          /> */}

          <AutoSizer>
            {({ height, width }) => (
              <KeplerGl
                id='kepler'
                mapboxApiAccessToken={process.env.REACT_APP_MAPBOX_TOKEN}
                width={width}
                height={height}
              />
            )}
          </AutoSizer>
        </div>
      </div>
      {queriesSection}
    </div>
  )
}
