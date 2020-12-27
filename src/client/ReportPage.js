import { useHistory, useParams } from 'react-router-dom'
import { Button, Input } from 'antd'
import { useEffect, useState } from 'react'
import KeplerGl from 'kepler.gl'
import styles from './ReportPage.module.css'
import { AutoSizer } from 'react-virtualized'
import { useDispatch, useSelector } from 'react-redux'
import { closeReport, openReport, createQuery, saveMap, reportTitleChange } from './actions'
import Query from './Query'
import { SaveOutlined, PlaySquareOutlined, EditOutlined } from '@ant-design/icons'
import debounce from 'lodash.debounce'
import { KeplerGlSchema } from 'kepler.gl/schemas'

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

const checkMapConfig = debounce((kepler, mapConfig, setMapChanged) => {
  if (kepler) {
    const configToSave = JSON.stringify(KeplerGlSchema.getConfigToSave(kepler))
    setMapChanged(configToSave !== mapConfig)
  }
}, 500)

function HeaderButtons ({ edit, changed, canSave, reportId }) {
  const dispatch = useDispatch()
  const history = useHistory()
  if (edit) {
    return (
      <div className={styles.headerButtons}>
        <Button
          type='primary'
          icon={<SaveOutlined />}
          disabled={!canSave}
          onClick={() => dispatch(saveMap())}
        >Save Map{changed ? '*' : ''}
        </Button>
        <Button
          icon={<PlaySquareOutlined />}
          disabled={changed}
          onClick={() => history.replace(`/reports/${reportId}`)}
        >Present
        </Button>
      </div>
    )
  }
  return (
    <div className={styles.headerButtons}>
      <Button
        type='primary'
        icon={<EditOutlined />}
        onClick={() => history.replace(`/reports/${reportId}/edit`)}
      >Edit
      </Button>
    </div>
  )
}

export default function ReportPage ({ edit }) {
  const { id } = useParams()

  const kepler = useSelector(state => state.keplerGl.kepler)
  const report = useSelector(state => state.report)
  const { mapConfig, title } = report || {}
  const reportStatus = useSelector(state => state.reportStatus)

  const dispatch = useDispatch()

  const [mapChanged, setMapChanged] = useState(false)

  useEffect(() => {
    dispatch(openReport(id, edit))
    return () => dispatch(closeReport(id))
  }, [id, dispatch, edit])

  useEffect(() => checkMapConfig(kepler, mapConfig, setMapChanged), [kepler, mapConfig, setMapChanged])
  const titleChanged = reportStatus.title && title && reportStatus.title !== title

  if (!report) {
    return null
  }

  return (
    <div className={styles.report}>
      <div className={styles.header}>
        <div className={styles.title}>
          <Input
            className={styles.titleInput}
            value={reportStatus.title}
            onChange={(e) => dispatch(reportTitleChange(e.target.value))}
            placeholder='Untitled'
            size='large'
            disabled={!edit}
            bordered={false}
          />
        </div>
        <HeaderButtons
          reportId={id}
          changed={mapChanged || titleChanged}
          canSave={reportStatus.canSave} edit={edit}
        />
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
        {edit ? <ReportQuery reportId={id} /> : null}
      </div>
    </div>
  )
}
