import { useParams } from 'react-router-dom'
import Input from 'antd/es/input'
import Modal from 'antd/es/modal'
import { useEffect, useState, Component } from 'react'
import { KeplerGl } from 'kepler.gl/dist/components'
import styles from './ReportPage.module.css'
import { AutoSizer } from 'react-virtualized'
import { useDispatch, useSelector } from 'react-redux'
import { closeReport, openReport, createQuery, reportTitleChange, removeQuery, setActiveQuery, error } from './actions'
import Query from './Query'
import { EditOutlined, WarningFilled } from '@ant-design/icons'
import { Query as QueryType } from '../proto/dekart_pb'
import Tabs from 'antd/es/tabs'
import { KeplerGlSchema } from 'kepler.gl/dist/schemas'
import classnames from 'classnames'
import DekartMenu from './DekartMenu'
import { Header } from './Header'
import ReportHeaderButtons from './ReportHeaderButtons'
import Downloading from './Downloading'

function TabIcon ({ query }) {
  let iconColor = 'transparent'
  if (query.jobError) {
    iconColor = '#F66B55'
  }
  switch (query.jobStatus) {
    case QueryType.JobStatus.JOB_STATUS_RUNNING:
      iconColor = '#B8B8B8'
      break
    case QueryType.JobStatus.JOB_STATUS_DONE:
      if (!query.jobResultId) {
        iconColor = '#B8B8B8'
        break
      }
      iconColor = '#52c41a'
      break
  }
  return (
    <span
      className={styles.tabIcon} style={{
        backgroundColor: iconColor
      }}
    />
  )
}

function getOnTabEditHandler (dispatch, reportId) {
  return (queryId, action) => {
    switch (action) {
      case 'add':
        return dispatch(createQuery(reportId))
      case 'remove':
        Modal.confirm({
          title: 'Are you sure delete query?',
          okText: 'Yes',
          okType: 'danger',
          cancelText: 'No',
          onOk: () => dispatch(removeQuery(queryId))
        })
    }
  }
}

function getTabPane (query, i, closable) {
  return (<Tabs.TabPane tab={<><TabIcon query={query} />{`Query ${i + 1}`}</>} key={query.id} closable={closable} />)
}

function QuerySection ({ reportId }) {
  const queries = useSelector(state => state.queries)
  const activeQuery = useSelector(state => state.activeQuery)
  const report = useSelector(state => state.report)
  const { canWrite } = report
  const dispatch = useDispatch()
  useEffect(() => {
    if (report && !(activeQuery)) {
      dispatch(createQuery(reportId))
    }
  }, [reportId, report, activeQuery, dispatch])
  if (activeQuery) {
    const closable = queries.length > 1 && canWrite
    return (
      <div className={styles.querySection}>
        <div className={styles.tabs}>
          <Tabs
            type='editable-card'
            activeKey={activeQuery.id}
            onChange={(queryId) => dispatch(setActiveQuery(queryId))}
            hideAdd={!canWrite}
            onEdit={getOnTabEditHandler(dispatch, reportId)}
          >
            {queries.map((query, i) => getTabPane(query, i, closable))}
          </Tabs>
        </div>
        <Query query={activeQuery} key={activeQuery.id} />
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

class CatchKeplerError extends Component {
  constructor (props) {
    super(props)
    this.state = { hasError: false }
  }

  componentDidCatch (error, errorInfo) {
    this.setState({ hasError: true })
    this.props.onError(error)
  }

  render () {
    if (this.state.hasError) {
      return (
        <div className={styles.keplerError}>
          <WarningFilled />
        </div>
      )
    }
    return this.props.children
  }
}

function Kepler () {
  const env = useSelector(state => state.env)
  const dispatch = useDispatch()
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
            <CatchKeplerError onError={(err) => dispatch(error(err))}>
              <KeplerGl
                id='kepler'
                mapboxApiAccessToken={env.variables.MAPBOX_TOKEN}
                width={width}
                height={height}
              />
            </CatchKeplerError>
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
  const envLoaded = useSelector(state => state.env.loaded)
  const { mapConfig, title } = report || {}
  const reportStatus = useSelector(state => state.reportStatus)

  const dispatch = useDispatch()

  const [mapChanged, setMapChanged] = useState(false)

  useEffect(() => {
    // make sure kepler loaded before firing kepler actions
    if (!envLoaded) {
      return
    }
    dispatch(openReport(id, edit))
    return () => dispatch(closeReport(id))
  }, [id, dispatch, edit, envLoaded])

  useEffect(() => checkMapConfig(kepler, mapConfig, setMapChanged), [kepler, mapConfig, setMapChanged])
  const titleChanged = reportStatus.title && title && reportStatus.title !== title

  if (!report) {
    return null
  }

  return (
    <div className={styles.report}>
      <Downloading />
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
