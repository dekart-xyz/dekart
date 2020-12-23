import { useParams } from 'react-router-dom'
import { Button } from 'antd'
import AceEditor from 'react-ace'

import 'ace-builds/src-noconflict/mode-sql'
import 'ace-builds/src-noconflict/theme-textmate'
import 'ace-builds/src-noconflict/ext-language_tools'
import 'ace-builds/webpack-resolver'
import { useEffect, useReducer } from 'react'
import { createQuery, runQuery, updateQuery } from './lib/grpc'
import { Query } from '../proto/dekart_pb'
import KeplerGl from 'kepler.gl'
import styles from './ReportPage.module.css'
import { AutoSizer } from 'react-virtualized'
import { useDispatch, useSelector } from 'react-redux'
import { closeReport, openReport } from './actions'

const defaultState = {
  queriesText: {}
}

function reducer (state, action) {
  switch (action.type) {
    case queryTextUpdate.name:
      return {
        ...state,
        queriesText: {
          ...state.queriesText,
          [action.queryId]: action.queryText
        }
      }
    default:
      return state
  }
}

function selectQueries (state) {
  return state.queries
}

function queryTextUpdate (queryId, queryText) {
  return {
    type: queryTextUpdate.name,
    queryId,
    queryText
  }
}

export default function ReportPage () {
  const { id } = useParams()
  const [{ queriesText }, dispatchState] = useReducer(reducer, defaultState)
  const queries = useSelector(selectQueries)
  const dispatch = useDispatch()
  useEffect(() => {
    dispatch(openReport(id))
    return () => dispatch(closeReport(id))
  }, [id, dispatch])
  let queriesSection
  if (queries && queries.length) {
    const queriesSections = queries.map(query => {
      const queryText = typeof queriesText[query.id] === 'string' ? queriesText[query.id] : query.queryText
      return (
        <div key={query.id} className={styles.query}>
          <div className={styles.editor}>
            <AutoSizer>
              {({ height, width }) => (
                <AceEditor
                  mode='sql'
                  width={`${width}px`}
                  height={`${height}px`}
                  theme='textmate'
          // onChange={onChange}
                  name={'AceEditor' + query.id}
                  onChange={value => dispatchState(queryTextUpdate(query.id, value))}
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
          <div>Status {Object.keys(Query.JobStatus).find(key => Query.JobStatus[key] === query.jobStatus)}</div>
          <div className={styles.buttons}>
            <Button onClick={() => updateQuery(query.id, queryText).catch(console.error)}>Save</Button>
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
