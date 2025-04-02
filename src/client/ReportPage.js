import { useParams } from 'react-router-dom'
import Input from 'antd/es/input'
import { useEffect, useState, Component } from 'react'
import { KeplerGl } from '@dekart-xyz/kepler.gl/dist/components'
import styles from './ReportPage.module.css'
import { AutoSizer } from 'react-virtualized'
import { useDispatch, useSelector } from 'react-redux'
import { EditOutlined, WarningFilled, MoreOutlined, PlusOutlined, ReadOutlined, ConsoleSqlOutlined, VerticalAlignBottomOutlined } from '@ant-design/icons'
import { QueryJob } from '../proto/dekart_pb'
import Tabs from 'antd/es/tabs'
import classnames from 'classnames'
import { Header } from './Header'
import ReportHeaderButtons from './ReportHeaderButtons'
import Downloading from './Downloading'
import Dataset from './Dataset'
import { Resizable } from 're-resizable'
import DatasetSettingsModal from './DatasetSettingsModal'
import getDatasetName from './lib/getDatasetName'
import { createDataset, openDatasetSettingsModal, setActiveDataset } from './actions/dataset'
import { closeReport, openReport, reportTitleChange, toggleReportEdit, toggleReportFullscreen } from './actions/report'
import { setError } from './actions/message'
import Tooltip from 'antd/es/tooltip'
import prettyBites from 'pretty-bytes'
import { getDatasourceMeta } from './lib/datasource'
import QueryParams from './QueryParams'
import { useCheckMapConfig } from './lib/mapConfig'
import Dropdown from 'antd/es/dropdown'
import Readme from './Readme'
import { addReadme, removeReadme, showReadmeTab } from './actions/readme'
import Modal from 'antd/es/modal'
import { MapControlButton } from '@dekart-xyz/kepler.gl/dist/components/common/styled-components'

function TabIcon ({ job }) {
  let iconColor = 'transparent'
  if (job.jobError) {
    iconColor = '#F66B55'
  }
  switch (job.jobStatus) {
    case QueryJob.JobStatus.JOB_STATUS_RUNNING:
    case QueryJob.JobStatus.JOB_STATUS_PENDING:
    case QueryJob.JobStatus.JOB_STATUS_READING_RESULTS:
      iconColor = '#B8B8B8'
      break
    case QueryJob.JobStatus.JOB_STATUS_DONE:
      if (!job.jobResultId) {
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
      case 'remove': {
        if (datasetId === 'readme') {
          Modal.confirm({
            title: 'Remove readme from report?',
            okText: 'Yes',
            okType: 'danger',
            cancelText: 'No',
            onOk: () => dispatch(removeReadme())
          })
        } else {
          dispatch(openDatasetSettingsModal(datasetId))
        }
        break
      }
      default:
        // do nothing
    }
  }
}

function QueryTooltip ({ job, dataset }) {
  const connectionList = useSelector(state => state.connection.list)
  if (!job) {
    return null
  }
  const updatedAt = new Date(job.updatedAt * 1000)
  const connection = connectionList.find(c => c.id === dataset.connectionId)
  const connectionMeta = connection ? getDatasourceMeta(connection.connectionType) : null

  const processed = job.bytesProcessed ? `Processed ${prettyBites(job.bytesProcessed)}` : 'cached'
  return (
    <span className={styles.queryTooltip}>
      {
        connection && connectionMeta ? <span>{connection.connectionName} ({connectionMeta.name})</span> : null
      }
      <span title={updatedAt.toISOString()}>{updatedAt.toLocaleString()}</span>
      <span>{processed}</span>
      {
        job.resultSize ? <span>Result {prettyBites(job.resultSize)}</span> : null
      }
    </span>
  )
}

function getTabPane (dataset, queries, files, status, queryJobs, closable) {
  let changed = false
  const title = getDatasetName(dataset, queries, files)
  let tabIcon = null
  let tooltip = null
  if (dataset.queryId) {
    const job = queryJobs.find(j => j.queryId === dataset.queryId)
    if (job) {
      tooltip = <QueryTooltip job={job} dataset={dataset} />
      tabIcon = <TabIcon job={job} />
    }
    changed = status.changed
  }
  const tabTitle = `${title}${changed ? '*' : ''}`
  return (
    <Tabs.TabPane
      tab={<Tooltip placement='bottom' title={tooltip}>{tabIcon}{tabTitle}</Tooltip>}
      key={dataset.id}
      closable={closable}
      closeIcon={<span title='Dataset setting'><MoreOutlined /></span>}
    />
  )
}

function DatasetSection ({ reportId }) {
  const datasets = useSelector(state => state.dataset.list)
  const queries = useSelector(state => state.queries)
  const queryJobs = useSelector(state => state.queryJobs)
  const files = useSelector(state => state.files)
  const activeDataset = useSelector(state => state.dataset.active)
  const report = useSelector(state => state.report)
  const queryStatus = useSelector(state => state.queryStatus)
  const { canWrite } = report
  const edit = useSelector(state => state.reportStatus.edit)
  const dispatch = useDispatch()
  const readmeTab = []
  const showReadme = useSelector(state => state.readme.showTab)
  const closable = Boolean(canWrite && edit)

  if (report.readme) {
    readmeTab.push(
      <Tabs.TabPane
        className={styles.addTabPane}
        tab={
          <><ReadOutlined /> Readme</>
      }
        key='readme'
        closable={closable}
      />
    )
  }

  const items = [
    {
      label: 'Data',
      icon: <ConsoleSqlOutlined />,
      onClick: () => {
        dispatch(createDataset(reportId))
      }
    },
    {
      label: 'Readme',
      icon: <ReadOutlined />,
      disabled: Boolean(report.readme),
      onClick: () => {
        dispatch(addReadme())
      }
    }
  ]

  useEffect(() => {
    if (report && !(activeDataset)) {
      dispatch(createDataset(reportId))
    }
  }, [reportId, report, activeDataset, dispatch])
  if (activeDataset || showReadme) {
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
                  activeKey={showReadme ? 'readme' : activeDataset.id}
                  onChange={(tabId) => {
                    switch (tabId) {
                      case 'readme':
                        dispatch(showReadmeTab())
                        return
                      case 'add':
                        return
                      default:
                        dispatch(setActiveDataset(tabId))
                    }
                  }}
                  hideAdd
                  onEdit={getOnTabEditHandler(dispatch, reportId)}
                >
                  {readmeTab.concat(datasets.map((dataset) => getTabPane(dataset, queries, files, queryStatus, queryJobs, closable))).concat(canWrite && edit && (
                    <Tabs.TabPane
                      className={styles.addTabPane}
                      tab={
                        <Dropdown menu={{ items }} placement='bottom'>
                          <span className={styles.addTab} id='dekart-report-page-add-tab'><PlusOutlined className={styles.addTabIcon} /></span>
                        </Dropdown>
                      }
                      key='add'
                      closable={false}
                      disabled={!canWrite}
                    />)
                  )}
                </Tabs>
              </div>
              {showReadme ? <Readme readme={report.readme} /> : <Dataset dataset={activeDataset} />}
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

function ToggleFullscreenButton () {
  const dispatch = useDispatch()

  return (
    <div className={styles.toggleFullscreen}>
      <Tooltip title='Toggle fullscreen' placement='left'>
        <MapControlButton active className={styles.toggleFullscreenButton} onClick={() => dispatch(toggleReportFullscreen())}>
          <VerticalAlignBottomOutlined />
        </MapControlButton>
      </Tooltip>
    </div>
  )
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
      <ToggleFullscreenButton />
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

  const report = useSelector(state => state.report)
  const envLoaded = useSelector(state => state.env.loaded)
  const files = useSelector(state => state.files || [])
  const queries = useSelector(state => state.queries || [])
  const fullscreen = useSelector(state => state.reportStatus.fullscreen)
  const updatedAt = [].concat(files, queries).reduce((updatedAt, item) => {
    if (item.updatedAt > updatedAt) {
      return item.updatedAt
    }
    return updatedAt
  }, 0)
  const updatedAtDate = new Date(updatedAt * 1000)

  const dispatch = useDispatch()

  useEffect(() => {
    // make sure kepler loaded before firing kepler actions
    if (!envLoaded) {
      return
    }
    // prevent open stream twice on first render
    const t = setTimeout(() => {
      dispatch(openReport(id))
    }, 0)
    return () => {
      clearTimeout(t)
      dispatch(closeReport())
    }
  }, [id, dispatch, envLoaded])

  useEffect(() => {
    dispatch(toggleReportEdit(edit))
  }, [id, edit, dispatch])

  useCheckMapConfig()

  if (!report) {
    return null
  }

  return (
    <div className={styles.report}>
      <Downloading />
      <Header
        title={(<Title />)}
        queryParams={(<QueryParams />)}
        buttons={(<ReportHeaderButtons
          edit={edit}
                  />)}
      />
      <div className={styles.body}>
        <div className={styles.keplerFlexWrapper}>
          <div className={styles.keplerFlex}>
            <Kepler />
            <div className={styles.meta}>
              {updatedAt ? <span className={styles.lastUpdated} title={`${updatedAtDate.toISOString()}`}>{updatedAtDate.toLocaleString()}</span> : null}
              {updatedAt && report.authorEmail !== 'UNKNOWN_EMAIL' ? <span className={styles.dot}> | </span> : null}
              {report.authorEmail !== 'UNKNOWN_EMAIL' ? <span className={styles.author} title='Report author'>{report.authorEmail}</span> : null}
            </div>
          </div>
        </div>
        {!fullscreen ? <DatasetSection reportId={id} /> : null}
      </div>
    </div>
  )
}
