import { useParams } from 'react-router-dom'
import { Button } from 'antd'
import { useEffect } from 'react'
import { createQuery } from './lib/grpc'
import KeplerGl from 'kepler.gl'
import styles from './ReportPage.module.css'
import { AutoSizer } from 'react-virtualized'
import { useDispatch, useSelector } from 'react-redux'
import { closeReport, openReport } from './actions'
import Query from './Query'

function selectQueries (state) {
  return state.queries
}

export default function ReportPage () {
  const { id } = useParams()
  const queries = useSelector(selectQueries)
  const dispatch = useDispatch()
  useEffect(() => {
    dispatch(openReport(id))
    return () => dispatch(closeReport(id))
  }, [id, dispatch])
  let queriesSection
  if (queries && queries.length) {
    const queriesSections = queries.map(query => <Query query={query} key={query.id} />)
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
