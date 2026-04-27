import { useParams } from 'react-router-dom'
import Input from 'antd/es/input'
import { useEffect, useState, Component, useMemo } from 'react'
import { Helmet } from 'react-helmet'
import { KeplerGl } from '@kepler.gl/components'
import styles from './ReportPage.module.css'
import { AutoSizer } from 'react-virtualized'
import { useDispatch, useSelector } from 'react-redux'
import { EditOutlined, WarningFilled, MoreOutlined, ReadOutlined } from '@ant-design/icons'
import { QueryJob } from 'dekart-proto/dekart_pb'
import Tabs from 'antd/es/tabs'
import classnames from 'classnames'
import { Header } from './Header'
import ReportHeaderButtons from './ReportHeaderButtons'
import Downloading from './Downloading'
import Dataset from './Dataset'
import { Resizable } from 're-resizable'
import DatasetSettingsModal from './DatasetSettingsModal'
import getDatasetName from './lib/getDatasetName'
import { createDataset, openDatasetSettingsModal, removeDataset, setActiveDataset } from './actions/dataset'
import { closeReport, openReport, reportTitleChange, reportWillOpen, toggleReportEdit } from './actions/report'
import { setError } from './actions/message'
import Tooltip from 'antd/es/tooltip'
import prettyBites from 'pretty-bytes'
import { getDatasourceMeta } from './lib/datasource'
import QueryParams from './QueryParams'
import { useCheckMapConfig } from './lib/mapConfig'
import Readme from './Readme'
import { removeReadme, showReadmeTab } from './actions/readme'
import Modal from 'antd/es/modal'
import { Loading } from './Loading'
import ToggleFullscreenButton from './ToggleFullscreenButton'
import ShowMyLocationButton from './ShowMyLocationButton'
import { UNKNOWN_EMAIL } from './lib/constants'
import { track } from './lib/tracking'
import { getDefaultMapStyles } from '@kepler.gl/reducers'
import { getApplicationConfig } from '@kepler.gl/utils'
import UserPositionOverlay from './UserPositionOverlay'
import { useBasemapReady } from './lib/useBasemapReady'
import { useSnapshotReady } from './lib/useSnapshotReady'

// Build keyboard hint text for tab tooltips.
function getTabShortcutLabel (tabIndex) {
  if (tabIndex < 0 || tabIndex > 8) {
    return null
  }
  return `In editor: Ctrl+Shift+${tabIndex + 1}`
}

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

function getOnTabEditHandler (dispatch, reportId, datasets) {
  return (datasetId, action) => {
    switch (action) {
      case 'add':
        track('AddDatasetTab', { reportId })
        return dispatch(createDataset(reportId))
      case 'remove': {
        if (datasetId === 'readme') {
          track('RemoveReadmeClicked', { reportId })
          Modal.confirm({
            title: 'Remove readme from report?',
            okText: 'Yes',
            okType: 'danger',
            cancelText: 'No',
            onOk: () => {
              track('RemoveReadmeConfirmed', { reportId })
              dispatch(removeReadme())
            }
          })
        } else if (datasetId) {
          const datasetsToRemove = datasets.find(d => d.id === datasetId)
          if (datasetsToRemove.fileId || datasetsToRemove.queryId) {
            track('OpenDatasetSettings', { datasetId })
            dispatch(openDatasetSettingsModal(datasetId))
          } else {
            track('RemoveDataset', { datasetId })
            dispatch(removeDataset(datasetsToRemove.id, true))
          }
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
        job?.resultSize ? <span>Result {prettyBites(job.resultSize)}</span> : null
      }
    </span>
  )
}

function getTabPane (dataset, queries, files, status, queryJobs, closable, lastDataset, tabIndex) {
  let changed = false
  const title = getDatasetName(dataset, queries, files)
  let tabIcon = null
  let tooltip = null
  const shortcutLabel = getTabShortcutLabel(tabIndex)
  if (dataset.queryId) {
    const job = queryJobs.find(j => j.queryId === dataset.queryId)
    if (job) {
      tooltip = <QueryTooltip job={job} dataset={dataset} />
      tabIcon = <TabIcon job={job} />
    }
    changed = status.changed
  }
  const tabTitle = `${title}${changed ? '*' : ''}`
  let closeIcon
  if (dataset.queryId || dataset.fileId) {
    closeIcon = <span title='Dataset setting'><MoreOutlined /></span>
  }
  return (
    <Tabs.TabPane
      tab={
        <Tooltip
          placement='bottom'
          title={
            <span className={styles.queryTooltip}>
              {shortcutLabel ? <span>{shortcutLabel}</span> : null}
              {tooltip}
            </span>
          }
        >{tabIcon}{tabTitle}
        </Tooltip>
      }
      key={dataset.id}
      closable={Boolean((closable && !lastDataset) || closeIcon)}
      closeIcon={closeIcon}
    />
  )
}

function DatasetSection ({ reportId }) {
  let datasets = useSelector(state => state.dataset.list)
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
  let showReadme = useSelector(state => state.readme.showTab)
  const closable = Boolean(canWrite && edit && datasets.length > 1)
  const lastDataset = datasets.length === 1

  // disable SQL panels when export is disabled
  const disableSQL = !report.allowExport && !report.canWrite

  if (report.readme) {
    const readmeShortcut = getTabShortcutLabel(0)
    readmeTab.push(
      <Tabs.TabPane
        className={styles.addTabPane}
        tab={
          <Tooltip placement='bottom' title={readmeShortcut ? <span>{readmeShortcut}</span> : null}>
            <>
              <ReadOutlined /> Readme
            </>
          </Tooltip>
        }
        key='readme'
        closable={canWrite && edit}
      />
    )
  }

  useEffect(() => {
    if (report && !(activeDataset) && !disableSQL) {
      dispatch(createDataset(reportId))
    }
  }, [reportId, report, activeDataset, dispatch, disableSQL])

  if (disableSQL) {
    if (!report.readme) {
      return null
    }
    showReadme = true
    datasets = []
  }

  if (activeDataset?.id || showReadme) {
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
                        track('ViewReadmeTab', { reportId })
                        dispatch(showReadmeTab())
                        return
                      default:
                        track('SwitchDatasetTab', { datasetId: tabId, reportId })
                        dispatch(setActiveDataset(tabId))
                    }
                  }}
                  hideAdd={!(canWrite && edit)}
                  onEdit={getOnTabEditHandler(dispatch, reportId, datasets)}
                >
                  {readmeTab.concat(datasets.map((dataset, index) => getTabPane(
                    dataset,
                    queries,
                    files,
                    queryStatus,
                    queryJobs,
                    closable,
                    lastDataset,
                    index + (report.readme ? 1 : 0)
                  )))}
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
  const title = reportStatus.title || ''
  const [value, setValue] = useState(title)
  const dispatch = useDispatch()
  useEffect(() => {
    if (title !== value && !edit) {
      setValue(title || '')
    }
  }, [title, value, edit])
  if (canWrite && reportStatus.edit && edit) {
    return (
      <div className={styles.title}>
        <Input
          id='dekart-report-title-input'
          className={styles.titleInput}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
          }}
          onBlur={() => {
            setEdit(false)
            track('ReportTitleChanged')
            dispatch(reportTitleChange(value))
          }}
          onPressEnter={() => {
            setEdit(false)
            track('ReportTitleChanged')
            dispatch(reportTitleChange(value))
          }}
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
          onClick={() => {
            if (reportStatus.edit) {
              track('ReportTitleEditClicked')
              setEdit(true)
            }
          }}
          title='Click to edit map title'
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
    track('KeplerError', { message: error.message }) // System error
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

// buildMapboxStaticIconURL returns map style thumbnail URL for Mapbox style picker.
function buildMapboxStaticIconURL (styleURL, token) {
  const path = styleURL.replace('mapbox://styles/', '')
  return `https://api.mapbox.com/styles/v1/${path}/static/0,0,1/160x120?access_token=${token}&logo=false&attribution=false`
}

function Kepler ({ snapshot, onSnapshotBasemapReadyChange }) {
  const env = useSelector(state => state.env)
  const report = useSelector(state => state.report)
  const isSnowpark = useSelector(state => state.env.isSnowpark)
  const dispatch = useDispatch()
  const [mapboxRef, setMapboxRef] = useState(null)
  useBasemapReady(snapshot, mapboxRef, onSnapshotBasemapReadyChange)

  // Filter out MapLibre styles (dark-matter, positron, voyager) only when isSnowpark is true
  // Keep only Mapbox styles and no-basemap option
  // Use getDefaultMapStyles to ensure icons have proper CDN URLs
  const mapStylesWithoutMapLibre = useMemo(() => {
    if (!isSnowpark) {
      return undefined
    }
    // Get CDN URL from application config
    const cdnUrl = getApplicationConfig().cdnUrl

    // Get all default styles with proper icon URLs
    const allDefaultStyles = getDefaultMapStyles(cdnUrl)

    // MapLibre style IDs to exclude
    const mapLibreStyleIds = ['dark-matter', 'positron', 'voyager']

    // Convert object to array and filter out MapLibre styles
    const mapboxOnly = Object.values(allDefaultStyles).filter(style => !mapLibreStyleIds.includes(style.id))

    // Replace icons with Mapbox Static Images so previews are served from Mapbox
    const token = env.variables.MAPBOX_TOKEN
    return mapboxOnly.map(style => ({
      ...style,
      icon: buildMapboxStaticIconURL(style.url, token)
    }))
  }, [isSnowpark, env])

  if (!env.loaded && !snapshot) {
    return (
      <div className={styles.keplerBlock} />
    )
  }

  const hideInteraction = !report.allowExport && !report.canWrite
  return (
    <div className={classnames(
      styles.keplerBlock, {
        [styles.hideExport]: !report.allowExport,
        [styles.hideInteraction]: hideInteraction
      })}
    >
      {!snapshot
        ? (
          <div className={styles.mapControlButtons}>
            <ToggleFullscreenButton />
            <ShowMyLocationButton />
          </div>
          )
        : null}
      <AutoSizer>
        {({ height, width }) => (
          <CatchKeplerError onError={(err) => dispatch(setError(err))}>
            <KeplerGl
              id='kepler'
              mapboxApiAccessToken={env.variables.MAPBOX_TOKEN}
              width={width}
              height={height}
              mapStyles={mapStylesWithoutMapLibre}
              mapStylesReplaceDefault={isSnowpark || undefined}
              getMapboxRef={setMapboxRef}
            />
            {mapboxRef && <UserPositionOverlay map={mapboxRef} />}
          </CatchKeplerError>
        )}
      </AutoSizer>
    </div>
  )
}

export default function ReportPage ({ edit, snapshot }) {
  const { id } = useParams()

  const report = useSelector(state => state.report)
  const files = useSelector(state => state.files || [])
  const queries = useSelector(state => state.queries || [])
  const fullscreen = useSelector(state => state.reportStatus.fullscreen)
  const [snapshotBasemapReady, setSnapshotBasemapReady] = useState(false)
  const { reportDepsReady } = useSnapshotReady(snapshot, id, snapshotBasemapReady)
  const updatedAt = [].concat(files, queries).reduce((updatedAt, item) => {
    if (item.updatedAt > updatedAt) {
      return item.updatedAt
    }
    return updatedAt
  }, 0)
  const updatedAtDate = new Date(updatedAt * 1000)

  const dispatch = useDispatch()

  // Track report page views
  useEffect(() => {
    if (id && reportDepsReady) {
      track('ReportPageViewed', { reportId: id, edit, snapshot })
    }
  }, [id, reportDepsReady, edit, snapshot])

  useEffect(() => {
    // make sure kepler loaded before firing kepler actions
    if (!reportDepsReady) {
      return
    }

    dispatch(reportWillOpen(id))

    // prevent open stream twice on first render
    const t = setTimeout(() => {
      dispatch(openReport(id, snapshot))
    }, 0)
    return () => {
      clearTimeout(t)
      dispatch(closeReport())
    }
  }, [id, dispatch, reportDepsReady, snapshot])

  useEffect(() => {
    dispatch(toggleReportEdit(snapshot ? false : edit))
  }, [id, edit, snapshot, dispatch])

  useCheckMapConfig()

  if (!report) {
    return <Loading />
  }

  const reportTitle = report.title || 'Untitled Report'
  const pageTitle = edit ? `${reportTitle} - Edit` : reportTitle

  return (
    <div className={classnames(styles.report, { [styles.snapshot]: snapshot })}>
      <Helmet>
        <title>{pageTitle} — Dekart</title>
      </Helmet>
      {!snapshot ? <Downloading /> : null}
      {!snapshot
        ? (
          <Header
            title={(<Title />)}
            queryParams={(<QueryParams />)}
            buttons={<ReportHeaderButtons edit={edit} />}
          />
          )
        : null}
      <div className={classnames(styles.body, { [styles.snapshotBody]: snapshot })}>
        <div className={styles.keplerFlexWrapper}>
          <div className={styles.keplerFlex}>
            <Kepler
              snapshot={snapshot}
              onSnapshotBasemapReadyChange={setSnapshotBasemapReady}
            />
            {!snapshot
              ? (
                <div className={styles.meta}>
                  {updatedAt ? <span className={styles.lastUpdated} title={`${updatedAtDate.toISOString()}`}>{updatedAtDate.toLocaleString()}</span> : null}
                  {updatedAt && report.authorEmail !== UNKNOWN_EMAIL ? <span className={styles.dot}> | </span> : null}
                  {report.authorEmail !== UNKNOWN_EMAIL ? <span className={styles.author} title='Map author'>{report.authorEmail}</span> : null}
                </div>
                )
              : null}
          </div>
        </div>
        {!snapshot && !fullscreen ? <DatasetSection reportId={id} /> : null}
      </div>
    </div>
  )
}
