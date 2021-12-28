import { useEffect, useRef, useState } from 'react'
import { Header } from './Header'
import styles from './HomePage.module.css'
import Button from 'antd/es/button'
import Radio from 'antd/es/radio'
import Result from 'antd/es/result'
import Table from 'antd/es/table'
import { archiveReport, createReport, subscribeReports, testVersion, unsubscribeReports } from './actions'
import { useDispatch, useSelector } from 'react-redux'
import { PlusOutlined, GiftOutlined } from '@ant-design/icons'
import DataDocumentationLink from './DataDocumentationLink'
import { getRef } from './lib/ref'

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
    dataIndex: 'delete',
    render: (t, report) => <ArchiveButton report={report} />,
    className: styles.deleteColumn
  }
]

function Reports ({ reports, createReportButton, archived }) {
  const [archivedFilter, setArchivedFilter] = useState('active')
  useEffect(() => {
    if (archived.length === 0) {
      setArchivedFilter('active')
    }
  }, [archived, setArchivedFilter])
  if (reports.length === 0) {
    return (
      <div className={styles.reports}>
        <Result
          status='success'
          title='You are all set'
          subTitle='Get ready to create you first map with Dekart'
          extra={createReportButton}
        />
        <DataDocumentationLink />
      </div>
    )
  } else {
    return (
      <div className={styles.reports}>
        <div className={styles.reportsHeader}>
          <Radio.Group value={archivedFilter} onChange={(e) => setArchivedFilter(e.target.value)}>
            <Radio.Button value='active'>Active Reports</Radio.Button>
            <Radio.Button value='archived' disabled={archived.length === 0}>Archived Reports</Radio.Button>
          </Radio.Group>
        </div>
        <Table
          dataSource={archivedFilter === 'active' ? reports : archived}
          columns={columns}
          showHeader={false}
          rowClassName={styles.reportsRow}
          pagination={false}
          rowKey='id'
        />
      </div>
    )
  }
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
        buttons={<div className={styles.headerButtons}>{reportsList.loaded && reportsList.reports.length ? createReportButton : null}</div>}
      />
      <div className={styles.body}>
        <NewVersion />
        {
          reportsList.loaded
            ? <Reports
                reports={reportsList.reports}
                archived={reportsList.archived}
                createReportButton={createReportButton}
                body={body}
              />
            : <Loading />
        }
      </div>
    </div>
  )
}
