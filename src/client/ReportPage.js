import { useParams } from 'react-router-dom'
import { Button, Input } from 'antd'
import { useEffect } from 'react'
import KeplerGl from 'kepler.gl'
import styles from './ReportPage.module.css'
import { AutoSizer } from 'react-virtualized'
import { useDispatch, useSelector } from 'react-redux'
import { closeReport, openReport, createQuery, saveMapConfig } from './actions'
import Query from './Query'

function ReportQuery ({ reportId }) {
  const queries = useSelector(state => state.queries)
  const report = useSelector(state => state.report)
  const dispatch = useDispatch()
  useEffect(() => {
    if (report && !(queries && queries.length)) {
      dispatch(createQuery(reportId))
    }
  }, [reportId, report, queries, dispatch])
  if (queries && queries.length) {
    const queriesSections = queries.map(query => <Query query={query} key={query.id} />)
    return (
      <div className={styles.querySection}>{queriesSections}</div>
    )
  } else {
    return null
  }
}

export default function ReportPage () {
  const { id } = useParams()

  // const queries = useSelector(selectQueries)
  // const visState = useSelector(selectVisState, shallowEqual)
  const reportStatus = useSelector(state => state.reportStatus)
  const dispatch = useDispatch()

  useEffect(() => {
    dispatch(openReport(id))
    return () => dispatch(closeReport(id))
  }, [id, dispatch])

  // useEffect(() => {
  //   dispatch(saveVisState())
  // }, [visState, dispatch])

  return (
    <div className={styles.report}>
      <div className={styles.header}>
        <div className={styles.title}>
          <Input placeholder='Report Title' size='large' bordered={false} />
        </div>
        <div className={styles.headerButtons}>
          <Button
            type='primary'
            disabled={!reportStatus.dataAdded}
            onClick={() => dispatch(saveMapConfig())}
          >Save Map
          </Button>
        </div>
      </div>
      <div className={styles.body}>
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
        <ReportQuery reportId={id} />
      </div>
    </div>
  )
}
