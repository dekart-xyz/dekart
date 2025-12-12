import { useEffect, useRef, useState, useMemo } from 'react'
import { Helmet } from 'react-helmet'
import { Header } from './Header'
import styles from './HomePage.module.css'
import Button from 'antd/es/button'
import Radio from 'antd/es/radio'
import Result from 'antd/es/result'
import Table from 'antd/es/table'
import Input from 'antd/es/input'
import { useDispatch, useSelector } from 'react-redux'
import { PlusOutlined, FileSearchOutlined, UsergroupAddOutlined, ApiTwoTone, LockOutlined, TeamOutlined, GlobalOutlined, EditOutlined, SearchOutlined, InboxOutlined } from '@ant-design/icons'
import DataDocumentationLink from './DataDocumentationLink'
import Switch from 'antd/es/switch'
import { archiveReport, subscribeReports, unsubscribeReports, createReport } from './actions/report'
import { editConnection, isSystemConnectionID, newConnection, newConnectionScreen, setDefaultConnection } from './actions/connection'
import ConnectionModal from './ConnectionModal'
import Tooltip from 'antd/es/tooltip'
import { useHistory } from 'react-router-dom/cjs/react-router-dom'
import { ConnectionType, PlanType } from 'dekart-proto/dekart_pb'
import Onboarding from './Onboarding'
import { DatasourceIcon } from './Datasource'
import { track } from './lib/tracking'
import { If } from './lib/helperElements'
import { useMapPreview } from './lib/useMapPreview'
import { getRelativeTime } from './lib/relativeTime'
import BigQueryConnectionTypeSelectorModal from './BigQueryConnectionTypeSelectorModal'
import { Loading } from './Loading'
import classnames from 'classnames'

function ArchiveReportButton ({ report }) {
  const dispatch = useDispatch()
  const [disabled, setDisabled] = useState(false)
  const disableArchivePublic = report.isPublic && !report.archived
  return (
    <Button
      id={report.archived ? 'dekart-restore-report' : 'dekart-archive-report'}
      className={styles.mapActionButton}
      type='default'
      size='small'
      icon={!report.archived ? <InboxOutlined /> : null}
      disabled={disabled || disableArchivePublic}
      title={disableArchivePublic ? 'Cannot archive public report. Unpublish it first.' : (report.archived ? 'Restore' : 'Archive')}
      onClick={(e) => {
        e.stopPropagation()
        dispatch(archiveReport(report.id, !report.archived))
        setDisabled(true)
      }}
    >
      {report.archived ? 'Restore' : undefined}
    </Button>
  )
}

const columns = [
  {
    dataIndex: 'connectionIcon',
    render: (t, connection) => <DatasourceIcon type={connection.connectionType} />,
    className: styles.iconColumn
  },
  {
    dataIndex: 'connectionName',
    render: (t, connection) => <OpenConnectionButton connection={connection} />,
    className: styles.titleColumn
  },
  {
    dataIndex: 'author', // used for reports and connections
    render: (t, item) => (
      <div
        title={
          `Created by ${item.authorEmail} at ${new Date(item.createdAt * 1000).toLocaleString()}, last updated at ${new Date(item.updatedAt * 1000).toLocaleString()}`
        } className={styles.author}
      >{item.authorEmail}
      </div>),
    className: styles.authorColumn
  },
  {
    dataIndex: 'setDefault',
    render: (t, connection) => <SetDefault connection={connection} />,
    className: styles.deleteColumn
  }
]

function SetDefault ({ connection }) {
  const dispatch = useDispatch()
  if (connection.isDefault) {
    return (
      <Tooltip title='Default connection is used for storing map metadata. Users required to have access to default bucket to view the report.'>Default</Tooltip>
    )
  }
  return (
    <Tooltip title='Default connection is used for storing map metadata. Users required to have access to default bucket to view the report.'>
      <Button
        type='text'
        className={styles.deleteButton}
        onClick={() => {
          track('SetDefaultConnection', { connectionId: connection.id })
          dispatch(setDefaultConnection(connection.id))
        }}
      >Set default
      </Button>
    </Tooltip>
  )
}

function OpenConnectionButton ({ connection }) {
  const dispatch = useDispatch()
  return (
    <Button
      type='link'
      onClick={() => {
        track('OpenConnectionSettings', { connectionId: connection.id, connectionType: connection.connectionType })
        dispatch(editConnection(connection.id, connection.connectionType, Boolean(connection.bigqueryKey)))
      }}
    >{connection.connectionName}
    </Button>
  )
}

function FirstReportOnboarding () {
  const isPlayground = useSelector(state => state.user.isPlayground)
  const dispatch = useDispatch()
  const isViewer = useSelector(state => state.user.isViewer)
  const isSelfHosted = useSelector(state => state.user.isSelfHosted)
  return (
    <>
      <Result
        status='success'
        title='You are all set'
        subTitle='Everything is ready to create you first map.'
        extra={(
          <>
            <Button
              icon={<PlusOutlined />} disabled={isViewer} type='primary' id='dekart-create-report' onClick={
                () => {
                  track('CreateMap')
                  dispatch(createReport())
                }
              }
            >Create map
            </Button>
            <If condition={isPlayground && !isSelfHosted}><div className={styles.stepBySetLink}><a target='_blank' href='https://dekart.xyz/docs/about/playground/#quick-start' rel='noreferrer'>Check step-by-step guide</a></div></If>
          </>
        )}
      />
      <DataDocumentationLink />
    </>
  )
}

function ConnectionTypeSelectorBottom () {
  const dispatch = useDispatch()
  const planType = useSelector(state => state.user.stream.planType)
  const showCancel = useSelector(state => state.connection.list).length > 0
  const newScreen = useSelector(state => state.connection.screen)
  const history = useHistory()
  if (showCancel) {
    return (
      <div className={styles.connectionSelectorBack}>
        <Button
          type='ghost' onClick={() => {
            track('ReturnFromConnectionSelector')
            if (newScreen) {
              dispatch(newConnectionScreen(false))
            } else {
              history.push('/')
            }
          }}
        >Return back
        </Button>
      </div>
    )
  }
  if (planType === PlanType.TYPE_PERSONAL) {
    return (
      <div className={styles.notSure}>
        <p>or</p>
        <Button ghost type='primary' href='https://dekart.xyz/self-hosted/?ref=ConnectionTypeSelector' target='_blank' onClick={() => track('GetStartedWithSelfHosting')}>Get Started with Self-Hosting</Button>
      </div>
    )
  }
  return null
}

// selects between Google Cloud and Snowflake
function ConnectionTypeSelector () {
  const dispatch = useDispatch()
  const [bigqueryModalOpen, setBigqueryModalOpen] = useState(false)
  const secretsEnabled = useSelector(state => state.env.secretsEnabled)
  useEffect(() => {
    track('ConnectionTypeSelector')
  }, [])
  return (
    <>
      <div className={styles.connectionTypeSelector}>
        <BigQueryConnectionTypeSelectorModal open={bigqueryModalOpen} onClose={() => setBigqueryModalOpen(false)} />
        <Button
          icon={<DatasourceIcon type={ConnectionType.CONNECTION_TYPE_BIGQUERY} />} size='large' onClick={() => {
            track('ConnectionTypeSelectorBigQuery')
            setBigqueryModalOpen(true)
          }}
        >BigQuery
        </Button>
        <Button
          disabled={!secretsEnabled}
          title={secretsEnabled ? '' : 'Feature is disabled. Contact your administrator to enable it.'}
          icon={<DatasourceIcon type={ConnectionType.CONNECTION_TYPE_SNOWFLAKE} />} size='large' onClick={() => {
            track('ConnectionTypeSelectorSnowflake')
            dispatch(newConnection(ConnectionType.CONNECTION_TYPE_SNOWFLAKE))
          }}
        >Snowflake
        </Button>
        <Button
          disabled={!secretsEnabled}
          title={secretsEnabled ? '' : 'Feature is disabled. Contact your administrator to enable it.'}
          icon={<DatasourceIcon type={ConnectionType.CONNECTION_TYPE_WHEROBOTS} />} size='large' onClick={() => {
            track('ConnectionTypeSelectorWherobots')
            dispatch(newConnection(ConnectionType.CONNECTION_TYPE_WHEROBOTS))
          }}
        >Wherobots
        </Button>
      </div>
      <ConnectionTypeSelectorBottom />
    </>
  )
}

function CreateConnection () {
  return (
    <>
      <Result
        status='success'
        icon={<ApiTwoTone />}
        title='Ready to connect!'
        subTitle={<>Select your data source to start building your map.</>}
        extra={<ConnectionTypeSelector />}
      />
    </>
  )
}

function ReportsHeader (
  { reportFilter, archived, setArchived }
) {
  const connectionList = useSelector(state => state.connection.list)
  const reportsList = useSelector(state => state.reportsList)
  const userDefinedConnection = useSelector(state => state.connection.userDefined)
  const dispatch = useDispatch()
  const history = useHistory()
  const { isAdmin, isViewer } = useSelector(state => state.user)

  const userStream = useSelector(state => state.user.stream)
  if (!userStream) {
    return null
  }

  return (
    <div className={styles.reportsHeader}>
      {
        userStream.planType > PlanType.TYPE_UNSPECIFIED
          ? (
            <Radio.Group
              value={reportFilter} onChange={(e) => {
                switch (e.target.value) {
                  case 'my':
                    history.push('/')
                    break
                  case 'discoverable':
                    history.push('/shared')
                    break
                  case 'connections':
                    history.push('/connections')
                    break
                  default:
                  // do nothing
                }
              }}
            >
              <Radio.Button value='my'>My Maps</Radio.Button>
              <Radio.Button value='discoverable'>Shared Maps</Radio.Button>
              {
                connectionList && userDefinedConnection ? <Radio.Button value='connections'>Connections</Radio.Button> : null
              }
            </Radio.Group>

            )
          : (
            <div className={styles.reportsHeaderTitle}>{reportFilter === 'connections' ? 'Connection' : 'Maps'}</div>
            )
      }
      <div className={styles.rightCornerAction}>
        {
          reportFilter === 'connections'
            ? (
              <Button
                disabled={!isAdmin}
                type='primary'
                title={isAdmin ? 'Create new connection' : 'Only admin can create new connection'}
                onClick={() => {
                  track('NewConnectionButton')
                  dispatch(newConnectionScreen(true))
                }}
              >New Connection
              </Button>
              )
            : (
              <>
                {
                  reportFilter === 'my'
                    ? (
                      <div className={styles.archivedSwitch}>
                        <div className={styles.archivedSwitchLabel}>Archived</div>
                        <Switch id='dekart-archived-switch' checked={archived} disabled={reportsList.archived.length === 0} onChange={(checked) => setArchived(checked)} />
                      </div>
                      )
                    : null
                }
                <Button
                  id='dekart-create-report' type='primary' disabled={isViewer} onClick={() => {
                    track('NewMap')
                    dispatch(createReport())
                  }}
                >New Map
                </Button>
              </>
              )
        }
      </div>
    </div>

  )
}

function getPrivacyStatus (report) {
  if (report.isPlayground || report.isPublic) {
    return { label: 'Public', icon: <GlobalOutlined />, className: styles.public }
  }
  if (report.discoverable || report.hasDirectAccess) {
    return { label: 'Shared', icon: <TeamOutlined />, className: styles.shared }
  }
  return { label: 'Private', icon: <LockOutlined />, className: styles.private }
}

function PreviewConnectionIcons ({ report }) {
  const connectionTypes = report.connectionTypesList
  if (connectionTypes.length === 0) return null
  return (
    <div className={styles.previewConnectionIcons}>
      {connectionTypes.map((connectionType, index) => (
        <span key={index} className={styles.previewConnectionIcon}>
          <DatasourceIcon type={connectionType} />
        </span>
      ))}
    </div>
  )
}

function filterDataSource (dataSource, searchQuery, reportFilter) {
  if (!searchQuery.trim()) {
    return dataSource
  }
  const query = searchQuery.toLowerCase()
  return dataSource.filter(item => {
    if (reportFilter === 'connections') {
      return item.connectionName?.toLowerCase().includes(query) ||
             item.authorEmail?.toLowerCase().includes(query)
    }
    return item.title?.toLowerCase().includes(query) ||
           item.authorEmail?.toLowerCase().includes(query)
  })
}

function MapCard ({ report, reportFilter, archived, authEnabled }) {
  const history = useHistory()
  const privacy = getPrivacyStatus(report)
  const modifiedDate = new Date(report.updatedAt * 1000)
  const { previewUrl, previewLoading, previewError, setPreviewLoading, setPreviewError } = useMapPreview(report)

  const handleEdit = (e) => {
    e.stopPropagation()
    track('EditMap', { reportId: report.id })
    history.push(`/reports/${report.id}/source`)
  }

  const handleCardClick = () => {
    if (report.archived) {
      return
    }
    track('ViewMap', { reportId: report.id })
    history.push(`/reports/${report.id}`)
  }

  return (
    <div className={classnames(styles.mapCard, { [styles.mapCardArchived]: report.archived })} onClick={handleCardClick}>
      <div className={styles.mapPreview}>
        <div className={classnames(styles.privacyBadge, styles.privacyBadgeOverlay, privacy.className)}>
          {privacy.icon}
          {privacy.label === 'Public' && <span>{privacy.label}</span>}
        </div>
        <PreviewConnectionIcons report={report} />
        <img
          src={previewUrl}
          alt={report.title}
          className={classnames(styles.previewImage, { [styles.previewImageHidden]: previewLoading || previewError })}
          onLoad={() => {
            setPreviewLoading(false)
            setPreviewError(false)
          }}
          onError={(e) => {
            console.warn('Map preview failed to load:', previewUrl, e)
            setPreviewError(true)
            setPreviewLoading(false)
          }}
        />
        {(previewLoading || previewError) && (
          <div className={styles.previewPlaceholder}>
            <FileSearchOutlined />
          </div>
        )}
      </div>
      <div className={styles.mapCardContent}>
        <h3
          className={classnames(styles.mapTitle, { [styles.mapTitleUntitled]: !report.title || report.title === 'Untitled' })}
          title={(!report.title || report.title === 'Untitled') ? 'Click to rename this map' : undefined}
        >
          {report.title || 'Untitled'}
        </h3>
        <div className={styles.mapMeta}>
          <div className={styles.mapMetaContent}>
            <div className={styles.mapMetaLeft}>
              <div className={styles.mapMetaRow}>
                <span
                  className={styles.mapUpdatedDate}
                  title={`${modifiedDate.toLocaleString()} (${modifiedDate.toUTCString()})`}
                >
                  Updated {getRelativeTime(modifiedDate)}
                </span>
              </div>
              {report.authorEmail && (
                <div className={styles.mapMetaRow}>
                  <span className={styles.mapAuthorInline}>
                    {report.authorEmail}
                  </span>
                </div>
              )}
            </div>
            {/* Action buttons - right side, shown on hover */}
            <div className={styles.mapActions}>
              {report.canWrite && !report.archived && (
                <Button
                  type='default'
                  size='small'
                  icon={<EditOutlined />}
                  onClick={handleEdit}
                  className={styles.mapActionButton}
                  title='Edit'
                />
              )}
              {reportFilter === 'my' && (
                <ArchiveReportButton report={report} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Reports ({ createReportButton, reportFilter }) {
  const [archived, setArchived] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const reportsList = useSelector(state => state.reportsList)
  const { loaded: envLoaded, authEnabled } = useSelector(state => state.env)
  const connectionList = useSelector(state => state.connection.list.filter(c => !isSystemConnectionID(c.id)))
  // TODO: show default SQL connection in the list
  // const userDefinedConnection = useSelector(state => state.connection.userDefined)
  const newConnectionScreen = useSelector(state => state.connection.screen)
  const isAdmin = useSelector(state => state.user.isAdmin)
  useEffect(() => {
    if (reportsList.archived.length === 0) {
      setArchived(false)
    }
  }, [reportsList, setArchived])

  // Calculate dataSource - must be before useMemo
  let dataSource = []
  if (reportFilter === 'my') {
    dataSource = archived ? reportsList.archived : reportsList.my
  } else if (reportFilter === 'connections') {
    dataSource = connectionList
  } else {
    dataSource = reportsList.discoverable
  }

  // Filter by search query - must be called before any early returns
  const filteredDataSource = useMemo(() => {
    return filterDataSource(dataSource, searchQuery, reportFilter)
  }, [dataSource, searchQuery, reportFilter])

  // Early returns after all hooks
  if (!envLoaded) {
    return null
  }
  if (newConnectionScreen || (reportFilter === 'connections' && connectionList.length === 0 && isAdmin)) {
    return (
      <div className={styles.reports}>
        <CreateConnection />
      </div>
    )
  }
  if (reportsList.my.length === 0 && reportsList.discoverable.length === 0 && reportsList.archived.length === 0) {
    return (
      <div className={styles.reports}><FirstReportOnboarding createReportButton={createReportButton} /></div>
    )
  } else {
    // For connections, still use table view
    if (reportFilter === 'connections') {
      return (
        <div className={styles.reports}>
          <ReportsHeader
            reportFilter={reportFilter}
            archived={archived}
            setArchived={setArchived}
          />
          {filteredDataSource.length
            ? (
              <Table
                dataSource={filteredDataSource}
                columns={columns}
                showHeader={false}
                rowClassName={styles.reportsRow}
                pagination={false}
                rowKey='id'
                className={styles.reportsTable}
              />
              )
            : null}
        </div>
      )
    }

    return (
      <div className={styles.reports}>
        <ReportsHeader
          reportFilter={reportFilter}
          archived={archived}
          setArchived={setArchived}
        />
        <div className={styles.searchBar}>
          <Input
            placeholder='Search maps...'
            prefix={<SearchOutlined />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            allowClear
            className={styles.searchInput}
          />
        </div>
        {filteredDataSource.length
          ? (
            <div className={styles.mapsGrid}>
              {filteredDataSource.map(report => (
                <MapCard
                  key={report.id}
                  report={report}
                  reportFilter={reportFilter}
                  archived={archived}
                  authEnabled={authEnabled}
                />
              ))}
            </div>
            )
          : reportFilter === 'discoverable'
            ? (<OnboardingDiscoverableReports />)
            : (<OnboardingMyReports />)}
      </div>
    )
  }
}

function OnboardingMyReports () {
  return (
    <Onboarding
      icon={<FileSearchOutlined />} title='View, manage, and organize the maps that you have created ' steps={
        <ol>
          <li>Click on the "New Map" button in the top right corner</li>
          <li>Save the map and give it a relevant name.</li>
          <li>Your map will appear here.</li>
        </ol>
      }
    />
  )
}

function OnboardingDiscoverableReports () {
  return (
    <Onboarding
      icon={<UsergroupAddOutlined />}
      title='Shared maps helps your others to discover and reuse your reports'
      steps={
        <ol>
          <li>Open the map that you want to share and click on the "Share" button on the top right corner of the page</li>
          <li>In a pop-up window select the option to make the map discoverable.</li>
          <li>Shared maps will appear in this tab for all users.</li>
        </ol>
      }
    />
  )
}

function getPageTitle (reportFilter) {
  switch (reportFilter) {
    case 'connections':
      return 'Connections'
    case 'discoverable':
      return 'Shared Maps'
    case 'my':
    default:
      return 'My Maps'
  }
}

export default function HomePage ({ reportFilter }) {
  const reportsList = useSelector(state => state.reportsList)
  const isPlayground = useSelector(state => state.user.isPlayground)
  const connectionsLoaded = useSelector(state => state.connection.listLoaded)
  const dispatch = useDispatch()
  const body = useRef()
  useEffect(() => {
    const t = setTimeout(() => {
      dispatch(subscribeReports())
    }, 0)
    return () => {
      clearTimeout(t)
      dispatch(unsubscribeReports())
    }
  }, [dispatch])

  return (
    <div className={styles.homePage}>
      <Helmet>
        <title>{getPageTitle(reportFilter)} — Dekart</title>
      </Helmet>
      <Header />
      <div className={styles.body}>
        {
          reportsList.loaded && (connectionsLoaded || isPlayground)
            ? (
              <>
                <ConnectionModal />
                <Reports
                  reportsList={reportsList}
                  body={body}
                  reportFilter={reportFilter}
                />
              </>
              )
            : <Loading />
        }
      </div>
    </div>
  )
}
