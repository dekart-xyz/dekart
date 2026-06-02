import { useEffect, useRef, useState, useMemo } from 'react'
import { Helmet } from 'react-helmet'
import { Header } from './Header'
import styles from './HomePage.module.css'
import Button from 'antd/es/button'
import Radio from 'antd/es/radio'
import Result from 'antd/es/result'
import Input from 'antd/es/input'
import { useDispatch, useSelector } from 'react-redux'
import { PlusOutlined, FileSearchOutlined, UsergroupAddOutlined, LockOutlined, TeamOutlined, GlobalOutlined, SearchOutlined, CheckOutlined, EditOutlined } from '@ant-design/icons'
import DataDocumentationLink from './DataDocumentationLink'
import Switch from 'antd/es/switch'
import { archiveReport, subscribeReports, unsubscribeReports, createReport } from './actions/report'
import { editConnection, isSystemConnectionID, newConnectionScreen, setDefaultConnection } from './actions/connection'
import ConnectionModal from './ConnectionModal'
import { useHistory } from 'react-router-dom/cjs/react-router-dom'
import { PlanType } from 'dekart-proto/dekart_pb'
import Onboarding from './Onboarding'
import { DatasourceIcon } from './Datasource'
import { track } from './lib/tracking'
import { If } from './lib/helperElements'
import { useMapPreview } from './lib/useMapPreview'
import { getRelativeTime } from './lib/relativeTime'
import { getMapCenterCoordinates } from './lib/mapPreviewState'
import CreateConnection from './CreateConnection'
import { Loading } from './Loading'
import classnames from 'classnames'
import { UNKNOWN_EMAIL } from './lib/constants'

function ArchiveReportButton ({ report }) {
  const dispatch = useDispatch()
  const [disabled, setDisabled] = useState(false)
  const disableArchivePublic = report.isPublic && !report.archived
  return (
    <Button
      id={report.archived ? 'dekart-restore-report' : 'dekart-archive-report'}
      className={classnames(styles.connectionCardSetDefaultButton, {
        [styles.connectionCardSetDefaultButtonDisabled]: disableArchivePublic
      })}
      type='text'
      size='small'
      disabled={disabled || disableArchivePublic}
      title={disableArchivePublic ? 'Cannot archive public report. Unpublish it first.' : (report.archived ? 'Restore' : 'Archive')}
      onClick={(e) => {
        e.stopPropagation()
        dispatch(archiveReport(report.id, !report.archived))
        setDisabled(true)
      }}
    >
      {report.archived ? 'Restore' : 'Archive'}
    </Button>
  )
}

function ConnectionCard ({ connection }) {
  const dispatch = useDispatch()
  const updatedDate = new Date(connection.updatedAt * 1000)
  const openConnection = () => {
    track('OpenConnectionSettings', { connectionId: connection.id, connectionType: connection.connectionType })
    dispatch(editConnection(connection.id, connection.connectionType, Boolean(connection.bigqueryKey)))
  }

  return (
    <div className={styles.connectionCard} onClick={openConnection}>
      <div className={styles.connectionCardHeader}>
        <div className={styles.connectionCardIcon}>
          <DatasourceIcon type={connection.connectionType} />
        </div>
      </div>
      <div className={styles.connectionCardTitle}>{connection.connectionName}</div>
      <div className={styles.connectionCardMetaGrid}>
        <div className={styles.connectionCardMetaLabel}>Owner</div>
        <div className={styles.connectionCardMetaValue}>{connection.authorEmail}</div>
        <div className={styles.connectionCardMetaLabel}>Updated</div>
        <div className={styles.connectionCardMetaValue}>{getRelativeTime(updatedDate)}</div>
      </div>
      <div className={styles.connectionCardDivider} />
      <div className={styles.connectionCardFooter}>
        <div className={styles.connectionCardDefaultStatus}>
          {connection.isDefault
            ? (
              <>
                <CheckOutlined />
                <span>Used by default</span>
              </>
              )
            : (
              <Button
                type='text'
                className={styles.connectionCardSetDefaultButton}
                onClick={(event) => {
                  event.stopPropagation()
                  track('SetDefaultConnection', { connectionId: connection.id })
                  dispatch(setDefaultConnection(connection.id))
                }}
              >Set default
              </Button>
              )}
        </div>
        <Button
          size='small'
          icon={<EditOutlined />}
          onClick={(event) => {
            event.stopPropagation()
            openConnection()
          }}
        >Edit
        </Button>
      </div>
    </div>
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

function FirstSetupOnboarding () {
  const dispatch = useDispatch()
  const history = useHistory()
  const isAdmin = useSelector(state => state.user.isAdmin)
  const isViewer = useSelector(state => state.user.isViewer)
  const allowFileUpload = useSelector(state => state.env.variables.ALLOW_FILE_UPLOAD)
  const fileUploadDisabledNote = allowFileUpload ? '' : 'File upload is disabled in configuration'

  return (
    <Result
      icon={<span className={styles.rocketIcon} />}
      title='Ready to connect'
      subTitle='Create your database connection or start by uploading a file.'
      extra={(
        <div className={styles.firstSetupActions}>
          <Button
            id='dekart-new-connection-onboarding'
            type='primary'
            disabled={!isAdmin}
            title={isAdmin ? 'Create new connection' : 'Only admin can create new connection'}
            onClick={() => history.push('/connections')}
          >New connection
          </Button>
          <Button
            id='dekart-use-file-upload'
            disabled={isViewer || !allowFileUpload}
            title={isViewer ? 'Viewers cannot create maps' : fileUploadDisabledNote}
            onClick={() => {
              track('CreateMap')
              dispatch(createReport())
            }}
          >Use file upload
          </Button>
        </div>
      )}
    />
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
            <Radio.Group
              value={reportFilter === 'discoverable' ? 'discoverable' : 'my'}
              onChange={(e) => {
                switch (e.target.value) {
                  case 'my':
                    history.push('/')
                    break
                  default:
                  // do nothing
                }
              }}
            >
              <Radio.Button value='my'>Maps</Radio.Button>
              <Radio.Button value='discoverable' disabled>Shared Maps</Radio.Button>
            </Radio.Group>
            )
      }
      <div className={styles.rightCornerAction}>
        {
          reportFilter === 'connections'
            ? (
              <Button
                id='dekart-new-connection-connections'
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
  if (report.isPublic) {
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
  const cardRef = useRef(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const card = cardRef.current
    if (!card) return

    const observer = new window.IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true)
            // Once visible, we can disconnect the observer
            observer.disconnect()
          }
        })
      },
      {
        rootMargin: '50px' // Start loading 50px before the card is visible
      }
    )

    observer.observe(card)

    return () => {
      observer.disconnect()
    }
  }, [])

  const { previewUrl, previewLoading, previewError, setPreviewLoading, setPreviewError } = useMapPreview(report, isVisible)
  const centerCoordinates = getMapCenterCoordinates(report.mapConfig)

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
    <div ref={cardRef} className={classnames(styles.mapCard, 'dekart-map-card', { [styles.mapCardArchived]: report.archived })} onClick={handleCardClick}>
      <div className={styles.mapPreview}>
        <div className={classnames(styles.privacyBadge, styles.privacyBadgeOverlay, privacy.className)}>
          {privacy.icon}
          <span>{privacy.label}</span>
        </div>
        <PreviewConnectionIcons report={report} />
        <div className={styles.previewCenterCoordinates}>
          {`${centerCoordinates.latitude.toFixed(2)}, ${centerCoordinates.longitude.toFixed(2)}`}
        </div>
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
          <div className={styles.mapMetaGrid}>
            <div className={styles.mapMetaLabel}>Owner</div>
            <div className={styles.mapMetaValue}>
              {(report.authorEmail && report.authorEmail !== UNKNOWN_EMAIL) ? report.authorEmail : 'Unknown'}
            </div>
            <div className={styles.mapMetaLabel}>Updated</div>
            <div
              className={styles.mapMetaValue}
              title={`${modifiedDate.toLocaleString()} (${modifiedDate.toUTCString()})`}
            >
              {getRelativeTime(modifiedDate)}
            </div>
          </div>
          <div className={styles.mapCardDivider} />
          <div className={styles.mapFooterActions}>
            {reportFilter === 'my' ? <ArchiveReportButton report={report} /> : <span />}
            {report.canWrite && !report.archived
              ? (
                <Button
                  type='default'
                  size='small'
                  icon={<EditOutlined />}
                  onClick={handleEdit}
                  className={styles.mapActionButton}
                  title='Edit'
                >Edit
                </Button>
                )
              : null}
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
  const { loaded: envLoaded, authEnabled, isCloud, isSnowpark } = useSelector(state => state.env)
  const allConnectionList = useSelector(state => state.connection.list)
  const connectionList = allConnectionList.filter(c => !isSystemConnectionID(c.id))
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
  const noMapsYet = reportsList.my.length === 0 && reportsList.discoverable.length === 0 && reportsList.archived.length === 0
  const isFirstLaunchSelfHosted = reportFilter === 'my' &&
    !isCloud &&
    !isSnowpark &&
    noMapsYet &&
    allConnectionList.length === 0
  if (noMapsYet) {
    return (
      <div className={styles.reports}>
        {isFirstLaunchSelfHosted ? <FirstSetupOnboarding /> : <FirstReportOnboarding createReportButton={createReportButton} />}
      </div>
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
              <div className={styles.connectionCardsGrid}>
                {filteredDataSource.map(connection => (
                  <ConnectionCard key={connection.id} connection={connection} />
                ))}
              </div>
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
          : searchQuery.trim()
            ? (
              <div className={styles.noResults}>
                No results found
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
