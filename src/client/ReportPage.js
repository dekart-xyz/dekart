import { useParams } from 'react-router-dom'
import Input from 'antd/es/input'
import Modal from 'antd/es/modal'
import { useEffect, useState, Component } from 'react'
import { KeplerGl } from '@dekart-xyz/kepler.gl/dist/components'
import styles from './ReportPage.module.css'
import { AutoSizer } from 'react-virtualized'
import { useDispatch, useSelector } from 'react-redux'
import { closeReport, openReport, reportTitleChange, setActiveDataset, error, createDataset, removeDataset } from './actions'
import { EditOutlined, WarningFilled } from '@ant-design/icons'
import { Query as QueryType } from '../proto/dekart_pb'
import Tabs from 'antd/es/tabs'
import { KeplerGlSchema } from '@dekart-xyz/kepler.gl/dist/schemas'
import classnames from 'classnames'
import { Header } from './Header'
import ReportHeaderButtons from './ReportHeaderButtons'
import Downloading from './Downloading'
import Dataset from './Dataset'
import { Resizable } from 're-resizable'

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
    default:
      // do nothing
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
  return (datasetId, action) => {
    switch (action) {
      case 'add':
        // return dispatch(createQuery(reportId))
        return dispatch(createDataset(reportId))
      case 'remove':
        Modal.confirm({
          title: 'Remove dataset from report?',
          okText: 'Yes',
          okType: 'danger',
          cancelText: 'No',
          onOk: () => dispatch(removeDataset(datasetId))
        })
        break
      default:
          // do nothing
    }
  }
}

function getTabPane (dataset, closable, queries, files, status) {
  let changed = false
  let title = 'New'
  let tabIcon = null
  if (dataset.queryId) {
    const i = queries.findIndex(q => q.id === dataset.queryId)
    const query = queries.find(q => q.id === dataset.queryId)
    tabIcon = <TabIcon query={query} />
    title = `Query ${i + 1}`
    changed = status.changed
  } else if (dataset.fileId) {
    const file = files.find(f => f.id === dataset.fileId)
    if (file && file.name) {
      title = file.name
    }
  }
  return (<Tabs.TabPane tab={<>{tabIcon}{`${title}${changed ? '*' : ''}`}</>} key={dataset.id} closable={closable} />)
}

function DatasetSection ({ reportId }) {
  const datasets = useSelector(state => state.datasets)
  const queries = useSelector(state => state.queries)
  const files = useSelector(state => state.files)
  const activeDataset = useSelector(state => state.activeDataset)
  const report = useSelector(state => state.report)
  const queryStatus = useSelector(state => state.queryStatus)
  const { canWrite } = report
  const dispatch = useDispatch()
  useEffect(() => {
    if (report && !(activeDataset)) {
      dispatch(createDataset(reportId))
    }
  }, [reportId, report, activeDataset, dispatch])
  if (activeDataset) {
    const closable = datasets.length > 1 && canWrite
    return (
      <Resizable
        enable={{ top: false, right: false, bottom: false, left: true, topRight: false, bottomRight: false, bottomLeft: false, topLeft: false }}
        className={styles.resizable}
        defaultSize={{ width: 'min(40%, 500px)' }}
      >
        <div className={styles.datasetSectionWrapper}>
          <div className={styles.datasetSection}>
            <div className={styles.tabs} id='dekart-report-page-tabs'>
              <Tabs
                type='editable-card'
                activeKey={activeDataset.id}
                onChange={(datasetId) => dispatch(setActiveDataset(datasetId))}
                hideAdd={!canWrite}
                onEdit={getOnTabEditHandler(dispatch, reportId)}
              >
                {datasets.map((dataset) => getTabPane(dataset, closable, queries, files, queryStatus))}
              </Tabs>
            </div>
            <Dataset dataset={activeDataset} />
          </div>
        </div>
      </Resizable>
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
          disabled={!(reportStatus.edit && canWrite)}
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
        >{
            reportStatus.edit && canWrite ? <EditOutlined className={styles.titleEditIcon} /> : null
          }{reportStatus.title}
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
  const queryChanged = useSelector(state => Object.values(state.queryStatus).reduce((queryChanged, queryStatus) => {
    return queryStatus.changed || queryChanged
  }, false))

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
      <Header
        title={(<Title />)}
        buttons={(<ReportHeaderButtons
          changed={mapChanged || titleChanged || queryChanged}
          edit={edit}
                  />)}
      />
      <div className={styles.body}>
        <Kepler />
        {report.authorEmail !== 'UNKNOWN_EMAIL' ? <div className={styles.author}>Author: {report.authorEmail}</div> : null}
        {edit ? <DatasetSection reportId={id} /> : null}
      </div>
    </div>
  )
}
