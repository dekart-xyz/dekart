import { useEffect, useRef, useState } from 'react'
import { Header } from './Header'
import styles from './HomePage.module.css'
import Button from 'antd/es/button'
import Radio from 'antd/es/radio'
import Result from 'antd/es/result'
import Table from 'antd/es/table'
import { useDispatch, useSelector } from 'react-redux'
import { PlusOutlined, FileSearchOutlined, UsergroupAddOutlined, ApiTwoTone, LockOutlined, TeamOutlined, GlobalOutlined } from '@ant-design/icons'
import DataDocumentationLink from './DataDocumentationLink'
import Switch from 'antd/es/switch'
import { archiveReport, subscribeReports, unsubscribeReports, createReport } from './actions/report'
import { editConnection, newConnection, newConnectionScreen, setDefaultConnection } from './actions/connection'
import ConnectionModal from './ConnectionModal'
import Tooltip from 'antd/es/tooltip'
import { useHistory } from 'react-router-dom/cjs/react-router-dom'
import { ConnectionType, PlanType } from '../proto/dekart_pb'
import Onboarding from './Onboarding'
import { DatasourceIcon } from './Datasource'
import { track } from './lib/tracking'
import BigQueryConnectionTypeSelectorModal from './BigQueryConnectionTypeSelectorModal'

function Loading () {
  return null
}

function ArchiveReportButton ({ report }) {
  const dispatch = useDispatch()
  const [disabled, setDisabled] = useState(false)
  return (
    <Button
      className={styles.deleteButton}
      type='text'
      disabled={disabled}
      onClick={() => {
        dispatch(archiveReport(report.id, !report.archived))
        setDisabled(true)
      }}
    >{report.archived ? 'Restore' : 'Archive'}
    </Button>
  )
}

const columns = [
  {
    dataIndex: 'icon',
    render: (t, report) => {
      if (report.isPlayground || report.isPublic) {
        return <GlobalOutlined title='This report accessible outside of workspace' />
      }
      if (report.discoverable) {
        return <TeamOutlined title='This report is discoverable by others users in the workspace' />
      }
      return <LockOutlined title='This is visible only to you' />
    },
    className: styles.iconColumn
  },
  {
    dataIndex: 'title',
    render: (t, report) => <a href={`/reports/${report.id}`}>{report.title}</a>,
    className: styles.titleColumn
  },
  {
    dataIndex: 'archivedTitle',
    render: (t, report) => report.title,
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
    dataIndex: 'delete',
    render: (t, report) => <ArchiveReportButton report={report} />,
    className: styles.deleteColumn
  },
  {
    dataIndex: 'connectionName',
    render: (t, connection) => <OpenConnectionButton connection={connection} />,
    className: styles.titleColumn
  },
  {
    dataIndex: 'connectionIcon',
    render: (t, connection) => <DatasourceIcon type={connection.connectionType} />,
    className: styles.iconColumn
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
      <Tooltip title='Default connection is used for storing report metadata. Users required to have access to default bucket to view the report.'>Default</Tooltip>
    )
  }
  return (
    <Tooltip title='Default connection is used for storing report metadata. Users required to have access to default bucket to view the report.'>
      <Button
        type='text'
        className={styles.deleteButton}
        onClick={() => {
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
        dispatch(editConnection(connection.id, connection.connectionType, Boolean(connection.bigqueryKey)))
      }}
    >{connection.connectionName}
    </Button>
  )
}

function filterColumns (filter) {
  return filter.map(f => columns.find(c => c.dataIndex === f))
}

function getColumns (reportFilter, archived, authEnabled) {
  if (reportFilter === 'my') {
    if (archived) {
      return filterColumns(['archivedTitle', 'delete'])
    }
    if (authEnabled) {
      return filterColumns(['icon', 'title', 'delete'])
    }
    return filterColumns(['title', 'delete'])
  } else if (reportFilter === 'connections') {
    return filterColumns(['connectionIcon', 'connectionName', 'author', 'setDefault'])
  } else {
    return filterColumns(['icon', 'title', 'author'])
  }
}

function FirstReportOnboarding () {
  const isPlayground = useSelector(state => state.user.isPlayground)
  const dispatch = useDispatch()
  const isViewer = useSelector(state => state.user.isViewer)
  return (
    <>
      <Result
        status='success'
        title='You are all set'
        subTitle='Everything is ready to create you first map.'
        extra={(
          <>
            <Button icon={<PlusOutlined />} disabled={isViewer} type='primary' id='dekart-create-report' onClick={() => dispatch(createReport())}>Create report</Button>
            {isPlayground
              ? (
                <div className={styles.stepBySetLink}><a target='_blank' href='https://dekart.xyz/docs/about/playground/#quick-start' rel='noreferrer'>Check step-by-step guide</a></div>
                )
              : null}
          </>
        )}
      />
      <DataDocumentationLink />
    </>
  )
}

// selects between Google Cloud and Snowflake
function ConnectionTypeSelector () {
  const connectionList = useSelector(state => state.connection.list)
  const showCancel = connectionList.length > 0 // show cancel button if there are connections
  const dispatch = useDispatch()
  const [bigqueryModalOpen, setBigqueryModalOpen] = useState(false)
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
          icon={<DatasourceIcon type={ConnectionType.CONNECTION_TYPE_SNOWFLAKE} />} size='large' onClick={() => {
            track('ConnectionTypeSelectorSnowflake')
            dispatch(newConnection(ConnectionType.CONNECTION_TYPE_SNOWFLAKE))
          }}
        >Snowflake
        </Button>
      </div>
      {showCancel
        ? (
          <div className={styles.connectionSelectorBack}>
            <Button type='ghost' onClick={() => dispatch(newConnectionScreen(false))}>Return back</Button>
          </div>
          )
        : (
          <div className={styles.notSure}>
            <p>or</p>
            <Button ghost type='primary' href='https://dekart.xyz/self-hosted/' target='_blank'>Get Started with Self-Hosting</Button>
          </div>
          )}
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
              <Radio.Button value='my'>My Reports</Radio.Button>
              <Radio.Button value='discoverable'>Shared Reports</Radio.Button>
              {
                connectionList && userDefinedConnection ? <Radio.Button value='connections'>Connections</Radio.Button> : null
              }
            </Radio.Group>

            )
          : (
            <div className={styles.reportsHeaderTitle}>{reportFilter === 'connections' ? 'Connection' : 'Reports'}</div>
            )
      }
      <div className={styles.rightCornerAction}>
        {
          reportFilter === 'connections'
            ? (
              <Button
                disabled={!isAdmin}
                title={isAdmin ? 'Create new connection' : 'Only admin can create new connection'}
                onClick={() => { dispatch(newConnectionScreen(true)) }}
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
                        <Switch checked={archived} disabled={reportsList.archived.length === 0} onChange={(checked) => setArchived(checked)} />
                      </div>
                      )
                    : null
                }
                <Button id='dekart-create-report' disabled={isViewer} onClick={() => dispatch(createReport())}>New Report</Button>
              </>
              )
        }
      </div>
    </div>

  )
}

function Reports ({ createReportButton, reportFilter }) {
  const [archived, setArchived] = useState(false)
  const reportsList = useSelector(state => state.reportsList)
  const { loaded: envLoaded, authEnabled } = useSelector(state => state.env)
  const connectionList = useSelector(state => state.connection.list)
  const userDefinedConnection = useSelector(state => state.connection.userDefined)
  const newConnectionScreen = useSelector(state => state.connection.screen)
  const isAdmin = useSelector(state => state.user.isAdmin)
  useEffect(() => {
    if (reportsList.archived.length === 0) {
      setArchived(false)
    }
  }, [reportsList, setArchived])
  if (!envLoaded) {
    return null
  }
  if ((userDefinedConnection && connectionList.length === 0 && isAdmin) || newConnectionScreen) {
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
    let dataSource = []
    if (reportFilter === 'my') {
      dataSource = archived ? reportsList.archived : reportsList.my
    } else if (reportFilter === 'connections') {
      dataSource = connectionList
    } else {
      dataSource = reportsList.discoverable
    }
    return (
      <div className={styles.reports}>
        <ReportsHeader
          reportFilter={reportFilter}
          archived={archived}
          setArchived={setArchived}
        />
        {dataSource.length
          ? (
            <Table
              dataSource={dataSource}
              columns={getColumns(reportFilter, archived, authEnabled)}
              showHeader={false}
              rowClassName={styles.reportsRow}
              pagination={false}
              rowKey='id'
            />
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
      icon={<FileSearchOutlined />} title='View, manage, and organize the reports that you have created ' steps={
        <ol>
          <li>Click on the "New Report" button in the top right corner</li>
          <li>Save the report and give it a relevant name.</li>
          <li>Your report will appear here.</li>
        </ol>
      }
    />
  )
}

function OnboardingDiscoverableReports () {
  return (
    <Onboarding
      icon={<UsergroupAddOutlined />}
      title='Shared reports helps your others to discover and reuse your reports'
      steps={
        <ol>
          <li>Open the report that you want to share and click on the "Share" button on the top right corner of the page</li>
          <li>In a pop-up window select the option to make the report discoverable.</li>
          <li>Shared reports will appear in this tab for all users.</li>
        </ol>
      }
    />
  )
}

export default function HomePage ({ reportFilter }) {
  const reportsList = useSelector(state => state.reportsList)
  const isPlayground = useSelector(state => state.user.isPlayground)
  const connectionsLoaded = useSelector(state => state.connection.listLoaded)
  const dispatch = useDispatch()
  const body = useRef()
  useEffect(() => {
    dispatch(subscribeReports())
    return () => dispatch(unsubscribeReports())
  }, [dispatch])
  return (
    <div className={styles.homePage}>
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
