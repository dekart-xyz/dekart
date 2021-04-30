import { useParams } from 'react-router-dom'
import Input from 'antd/es/input'
import { useEffect, useState } from 'react'
import { KeplerGl } from 'kepler.gl/components'
import styles from './ReportPage.module.css'
import { AutoSizer } from 'react-virtualized'
import { useDispatch, useSelector } from 'react-redux'
import { closeReport, openReport, createQuery, reportTitleChange } from './actions'
import Query from './Query'
import { EditOutlined } from '@ant-design/icons'
import Tabs from 'antd/es/tabs'
import { KeplerGlSchema } from 'kepler.gl/schemas'
import classnames from 'classnames'
import DekartMenu from './DekartMenu'
import { Header } from './Header'
import ReportHeaderButtons from './ReportHeaderButtons'

function QuerySection ({ reportId }) {
  const queries = useSelector(state => state.queries)
  const report = useSelector(state => state.report)
  const dispatch = useDispatch()
  useEffect(() => {
    if (report && !(queries && queries.length)) {
      dispatch(createQuery(reportId))
    }
  }, [reportId, report, queries, dispatch])
  if (queries && queries.length) {
    const query = queries[0]
    return (
      <div className={styles.querySection}>
        <div className={styles.tabs}>
          <Tabs type='editable-card' activeKey='0'>
            <Tabs.TabPane tab='Query 1' key='0' />
          </Tabs>
        </div>
        <Query query={query} key={query.id} />
      </div>
    )
  } else {
    return null
  }
}

let checkMapConfigTimer
function checkMapConfig (kepler, mapConfig, setMapChanged) {
  if (checkMapConfigTimer) {
    clearTimeout(checkMapConfigTimer)
  }
  checkMapConfigTimer = setTimeout(() => {
    if (kepler) {
      const configToSave = JSON.stringify(KeplerGlSchema.getConfigToSave(kepler))
      setMapChanged(configToSave !== mapConfig)
    }
    checkMapConfigTimer = null
  }, 500)
  return () => {
    if (checkMapConfigTimer) {
      clearTimeout(checkMapConfigTimer)
    }
  }
}

function Title () {
  const reportStatus = useSelector(state => state.reportStatus)
  const { canWrite } = useSelector(state => state.report)
  const [edit, setEdit] = useState(false)
  const dispatch = useDispatch()
  if (canWrite && reportStatus.edit && edit) {
    return (
      <div className={styles.title}>
        <Input
          className={styles.titleInput}
          value={reportStatus.title}
          onChange={(e) => dispatch(reportTitleChange(e.target.value))}
          onBlur={() => setEdit(false)}
          placeholder='Untitled'
          autoFocus
          // size='large'
          disabled={!(reportStatus.edit && canWrite)}
          // bordered={false}
        />
      </div>
    )
  } else {
    return (
      <div className={styles.title}>
        <span
          className={classnames(
            styles.titleText,
            {
              [styles.titleTextEdit]: reportStatus.edit && canWrite
            }
          )}
          onClick={() => reportStatus.edit && setEdit(true)}
        >{reportStatus.title} <EditOutlined className={styles.titleEditIcon} />
        </span>
      </div>
    )
  }
}

function Kepler () {
  const env = useSelector(state => state.env)
  if (!env.loaded) {
    return (
      <div className={styles.keplerFlex}>
        <div className={styles.keplerBlock} />
      </div>
    )
  }
  return (
    <div className={styles.keplerFlex}>
      <div className={styles.keplerBlock}>
        <AutoSizer>
          {({ height, width }) => (
            <KeplerGl
              id='kepler'
              mapboxApiAccessToken={env.variables.MAPBOX_TOKEN}
              width={width}
              height={height}
            />
          )}
        </AutoSizer>
      </div>
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
      <Header>
        <DekartMenu />
        <Title />
        <ReportHeaderButtons
          reportId={id}
          canWrite={report.canWrite}
          changed={mapChanged || titleChanged}
          canSave={reportStatus.canSave}
          edit={edit}
        />
      </Header>
      <div className={styles.body}>
        <Kepler />
        {edit ? <QuerySection reportId={id} /> : null}
      </div>
    </div>
  )
}
