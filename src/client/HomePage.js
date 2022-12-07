import { useEffect, useRef, useState } from 'react'
import { Header } from './Header'
import styles from './HomePage.module.css'
import Button from 'antd/es/button'
import Radio from 'antd/es/radio'
import Result from 'antd/es/result'
import Table from 'antd/es/table'
import { archiveReport, createReport, subscribeReports, testVersion, unsubscribeReports } from './actions'
import { useDispatch, useSelector } from 'react-redux'
import { PlusOutlined, FileSearchOutlined, GiftOutlined, UsergroupAddOutlined } from '@ant-design/icons'
import DataDocumentationLink from './DataDocumentationLink'
import { getRef } from './lib/ref'
import Switch from 'antd/es/switch'

function Loading () {
  return null
}

function ArchiveButton ({ report }) {
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
    dataIndex: 'title',
    render: (t, report) => <a href={`/reports/${report.id}/source`}>{report.title}</a>,
    className: styles.titleColumn
  },
  {
    dataIndex: 'archivedTitle',
    render: (t, report) => report.title,
    className: styles.titleColumn
  },
  {
    dataIndex: 'author',
    render: (t, report) => <div className={styles.author}>{report.authorEmail}</div>,
    className: styles.authorColumn
  },
  {
    dataIndex: 'delete',
    render: (t, report) => <ArchiveButton report={report} />,
    className: styles.deleteColumn
  }
]

function filterColumns (filter) {
  return columns.filter(c => filter.includes(c.dataIndex))
}

function getColumns (reportFilter, archived) {
  if (reportFilter === 'my') {
    if (archived) {
      return filterColumns(['archivedTitle', 'delete'])
    }
    return filterColumns(['title', 'delete'])
  } else {
    return filterColumns(['title', 'author'])
  }
}

function FirstReportOnboarding ({ createReportButton }) {
  return (
    <>
      <Result
        status='success'
        title='You are all set'
        subTitle='Get ready to create you first map with Dekart'
        extra={createReportButton}
      />
      <DataDocumentationLink />
    </>
  )
}

function ReportsHeader ({ authEnabled, reportFilter, setReportFilter, archived, setArchived, reportsList }) {
  return (
    <div className={styles.reportsHeader}>
      {
      authEnabled
        ? (
          <Radio.Group value={reportFilter} onChange={(e) => setReportFilter(e.target.value)}>
            <Radio.Button value='my'>My Reports</Radio.Button>
            <Radio.Button value='discoverable'>Team Reports</Radio.Button>
          </Radio.Group>

          )
        : (
          <div className={styles.reportsHeaderTitle}>Manage reports</div>
          )
      }
      {
        reportFilter === 'my' && reportsList.archived.length
          ? (
            <div className={styles.archivedSwitch}>
              <div className={styles.archivedSwitchLabel}>Archived</div>
              <Switch checked={archived} onChange={(checked) => setArchived(checked)} />
            </div>
            )
          : null
  }
    </div>

  )
}

function Reports ({ createReportButton, reportsList }) {
  const [archived, setArchived] = useState(false)
  const { loaded: envLoaded, authEnabled } = useSelector(state => state.env)
  const [reportFilter, setReportFilter] = useState(
    reportsList.my.length === 0 && reportsList.discoverable.length > 0 && authEnabled ? 'discoverable' : 'my'
  )
  useEffect(() => {
    if (reportsList.archived.length === 0) {
      setArchived(false)
    }
  }, [reportsList, setArchived])
  if (!envLoaded) {
    return null
  }
  if (reportsList.my.length === 0 && reportsList.discoverable.length === 0 && reportsList.archived.length === 0) {
    return (
      <div className={styles.reports}><FirstReportOnboarding createReportButton={createReportButton} /></div>
    )
  } else {
    const dataSource = reportFilter === 'my' ? archived ? reportsList.archived : reportsList.my : reportsList.discoverable
    return (
      <div className={styles.reports}>
        <ReportsHeader
          authEnabled={authEnabled}
          reportFilter={reportFilter}
          setReportFilter={setReportFilter}
          archived={archived}
          setArchived={setArchived}
          reportsList={reportsList}
        />
        {dataSource.length
          ? (
            <Table
              dataSource={dataSource}
              columns={getColumns(reportFilter, archived)}
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
          <li>Click on the "Create Report" button in the top right corner</li>
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
      title='Team reports enable you to share reports within a team or organization'
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

function Onboarding ({ icon, title, steps }) {
  return (
    <div className={styles.onboarding}>
      <div className={styles.onboardingIcon}>{icon}</div>
      <div className={styles.onboardingContent}>
        <div className={styles.onboardingTitle}>{title}</div>
        <div className={styles.onboardingSteps}>{steps}</div>
      </div>
    </div>
  )
}

function NewVersion () {
  const release = useSelector(state => state.release)
  const dispatch = useDispatch()
  useEffect(() => {
    dispatch(testVersion())
  }, [dispatch])
  if (release) {
    const ref = getRef()
    return (
      <div className={styles.newRelease}>
        <GiftOutlined className={styles.newReleaseIcon} />
        <div className={styles.newReleaseTitle}>New release {release.tag_name} available</div>
        <div>
          <Button type='primary' href={'https://dekart.xyz/docs/self-hosting/upgrade/?ref=' + ref}>Update</Button>
          <Button type='link' href={release.html_url + '?ref=' + ref}>Release Notes</Button>
        </div>
      </div>
    )
  }
  return null
}

export default function HomePage () {
  const reportsList = useSelector(state => state.reportsList)
  const dispatch = useDispatch()
  const body = useRef()
  useEffect(() => {
    dispatch(subscribeReports())
    return () => dispatch(unsubscribeReports())
  }, [dispatch])
  const createReportButton = <Button icon={<PlusOutlined />} type='primary' onClick={() => dispatch(createReport())}>Create Report</Button>

  return (
    <div className={styles.homePage}>
      <Header
        buttons={<div className={styles.headerButtons}>{reportsList.loaded && (reportsList.my.length || reportsList.discoverable.length) ? createReportButton : null}</div>}
      />
      <div className={styles.body}>
        <NewVersion />
        {
          reportsList.loaded
            ? <Reports
                reportsList={reportsList}
                createReportButton={createReportButton}
                body={body}
              />
            : <Loading />
        }
      </div>
    </div>
  )
}
