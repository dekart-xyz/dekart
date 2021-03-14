import { Redirect, useHistory, useParams } from 'react-router-dom'
import Button from 'antd/es/button'
import Tooltip from 'antd/es/tooltip'
import Input from 'antd/es/input'
import { useEffect, useState } from 'react'
import { KeplerGl } from 'kepler.gl/components'
import styles from './ReportPage.module.css'
import { AutoSizer } from 'react-virtualized'
import { useDispatch, useSelector } from 'react-redux'
import { closeReport, openReport, createQuery, saveMap, reportTitleChange } from './actions'
import Query from './Query'
import { SaveOutlined, PlaySquareOutlined, EditOutlined, InfoCircleFilled } from '@ant-design/icons'
import { KeplerGlSchema } from 'kepler.gl/schemas'
import classnames from 'classnames'
import DekartMenu from './DekartMenu'
import { Header } from './Header'

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

function HeaderButtons ({ edit, changed, canSave, reportId, canWrite }) {
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
        >Save{changed ? '*' : ''}
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
  if (canWrite) {
    return (
      <div className={styles.headerButtons}>
        <Button
          type='primary'
          disabled={!canWrite}
          icon={<EditOutlined />}
          onClick={() => history.replace(`/reports/${reportId}/edit`)}
        >Edit
        </Button>
      </div>
    )
  }
  return (
    <div className={styles.headerButtons}>
      <Tooltip title='The report is created by the other author. You can only view it.'>
        <div className={styles.readOnly}><span>Read-only</span><InfoCircleFilled /></div>
      </Tooltip>
    </div>
  )
}
// const title = canWrite ? 'Edit' : 'You can only view this report'

function Title () {
  const reportStatus = useSelector(state => state.reportStatus)
  const [edit, setEdit] = useState(false)
  const dispatch = useDispatch()
  if (reportStatus.edit && edit) {
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
          disabled={!reportStatus.edit}
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
            reportStatus.edit && styles.titleTextEdit
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

  if (edit && !report.canWrite) {
    return <Redirect to={`/reports/${id}`} />
  }

  return (
    <div className={styles.report}>
      <Header>
        <DekartMenu />
        <Title />
        <HeaderButtons
          reportId={id}
          canWrite={report.canWrite}
          changed={mapChanged || titleChanged}
          canSave={reportStatus.canSave}
          edit={edit}
        />
      </Header>
      <div className={styles.body}>
        <Kepler />
        {edit ? <ReportQuery reportId={id} /> : null}
      </div>
    </div>
  )
}
