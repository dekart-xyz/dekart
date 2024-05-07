import { useParams } from 'react-router-dom'
import Input from 'antd/es/input'
import { useEffect, useState, Component } from 'react'
import { KeplerGl } from '@dekart-xyz/kepler.gl/dist/components'
import styles from './ReportPage.module.css'
import { AutoSizer } from 'react-virtualized'
import { useDispatch, useSelector } from 'react-redux'
import { EditOutlined, WarningFilled, MoreOutlined } from '@ant-design/icons'
import { Query as QueryType } from '../proto/dekart_pb'
import Tabs from 'antd/es/tabs'
import { KeplerGlSchema } from '@dekart-xyz/kepler.gl/dist/schemas'
import classnames from 'classnames'
import { Header } from './Header'
import ReportHeaderButtons from './ReportHeaderButtons'
import Downloading from './Downloading'
import Dataset from './Dataset'
import { Resizable } from 're-resizable'
import DatasetSettingsModal from './DatasetSettingsModal'
import getDatasetName from './lib/getDatasetName'
import { createDataset, openDatasetSettingsModal, setActiveDataset } from './actions/dataset'
import { closeReport, openReport, reportTitleChange } from './actions/report'
import { setError } from './actions/message'
import Tooltip from 'antd/es/tooltip'
import prettyBites from 'pretty-bytes'

function TabIcon ({ query }) {
  let iconColor = 'transparent'
  if (query.jobError) {
    iconColor = '#F66B55'
  }
  switch (query.jobStatus) {
    case QueryType.JobStatus.JOB_STATUS_RUNNING:
    case QueryType.JobStatus.JOB_STATUS_PENDING:
    case QueryType.JobStatus.JOB_STATUS_READING_RESULTS:
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
        return dispatch(createDataset(reportId))
      case 'remove':
        dispatch(openDatasetSettingsModal(datasetId))
        break
      default:
        // do nothing
    }
  }
}

function getQueryTooltip (query) {
  if (!query) {
    return null
  }
  if (query.jobStatus !== QueryType.JobStatus.JOB_STATUS_DONE) {
    return null
  }
  const updatedAt = new Date(query.updatedAt * 1000)

  const processed = query.bytesProcessed ? `Processed ${prettyBites(query.bytesProcessed)}` : 'cached'
  return (
    <span className={styles.queryTooltip}>
      <span title={updatedAt.toISOString()}>{updatedAt.toLocaleString()}</span>
      <span>{processed}</span>
      {
        query.resultSize ? <span>Result {prettyBites(query.resultSize)}</span> : null
      }
    </span>
  )
}

function getTabPane (dataset, queries, files, status) {
  let changed = false
  const title = getDatasetName(dataset, queries, files)
  let tabIcon = null
  let tooltip = null
  if (dataset.queryId) {
    const query = queries.find(q => q.id === dataset.queryId)
    tooltip = getQueryTooltip(query)
    tabIcon = <TabIcon query={query} />
    changed = status.changed
  }
  const tabTitle = `${title}${changed ? '*' : ''}`
  return (
    <Tabs.TabPane
      tab={<Tooltip placement='bottom' title={tooltip}>{tabIcon}{tabTitle}</Tooltip>}
      key={dataset.id}
      closable
      closeIcon={<span title='Dataset setting'><MoreOutlined /></span>}
    />
  )
}

function DatasetSection ({ reportId }) {
  const datasets = useSelector(state => state.dataset.list)
  const queries = useSelector(state => state.queries)
  const files = useSelector(state => state.files)
  const activeDataset = useSelector(state => state.dataset.active)
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
    return (
      <>
        <Resizable
          enable={{ top: false, right: false, bottom: false, left: true, topRight: false, bottomRight: false, bottomLeft: false, topLeft: false }}
          className={styles.resizable}
          defaultSize={{ width: 'min(40%, 500px)' }}
        >
          <div className={styles.datasetSectionWrapper}>
            <div className={styles.datasetSection}>
              <div className={styles.tabs} id='dekart-report-page-tabs'>
                <Tabs
                  type={canWrite ? 'editable-card' : 'card'}
                  activeKey={activeDataset.id}
                  onChange={(datasetId) => dispatch(setActiveDataset(datasetId))}
                  hideAdd={!canWrite}
                  onEdit={getOnTabEditHandler(dispatch, reportId)}
                >
                  {datasets.map((dataset) => getTabPane(dataset, queries, files, queryStatus))}
                </Tabs>
              </div>
              <Dataset dataset={activeDataset} />
            </div>
          </div>
        </Resizable>
        <DatasetSettingsModal />
      </>
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
          title='Click to edit report title'
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
      <div className={styles.keplerBlock} />
    )
  }
  return (
    <div className={styles.keplerBlock}>
      <AutoSizer>
        {({ height, width }) => (
          <CatchKeplerError onError={(err) => dispatch(setError(err))}>
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
  )
}

export default function ReportPage ({ edit }) {
  const { id } = useParams()

  const kepler = useSelector(state => state.keplerGl.kepler)
  const report = useSelector(state => state.report)
  const envLoaded = useSelector(state => state.env.loaded)
  const { mapConfig, title } = report || {}
  const files = useSelector(state => state.files || [])
  const queries = useSelector(state => state.queries || [])
  const updatedAt = [].concat(files, queries).reduce((updatedAt, item) => {
    if (item.updatedAt > updatedAt) {
      return item.updatedAt
    }
    return updatedAt
  }, 0)
  const updatedAtDate = new Date(updatedAt * 1000)
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
        <div className={styles.keplerFlex}>
          <Kepler />
          <div className={styles.meta}>
            {updatedAt ? <span className={styles.lastUpdated} title={`${updatedAtDate.toISOString()}`}>{updatedAtDate.toLocaleString()}</span> : null}
            {updatedAt && report.authorEmail !== 'UNKNOWN_EMAIL' ? <span className={styles.dot}> | </span> : null}
            {report.authorEmail !== 'UNKNOWN_EMAIL' ? <span className={styles.author} title='Report author'>{report.authorEmail}</span> : null}
          </div>
        </div>
        {edit ? <DatasetSection reportId={id} /> : null}
      </div>
    </div>
  )
}
