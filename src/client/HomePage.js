import { useEffect, useRef } from 'react'
import { useHistory } from 'react-router-dom'
import DekartMenu from './DekartMenu'
import { Header } from './Header'
import styles from './HomePage.module.css'
import { Button, Result, Table } from 'antd'
import { createReport, subscribeReports, unsubscribeReports } from './actions'
import { useDispatch, useSelector } from 'react-redux'
import { PlusOutlined } from '@ant-design/icons'

function Loading () {
  return null
}

const columns = [
  {
    dataIndex: 'title',
    render: (t, report) => <a href={`/reports/${report.id}`}>{report.title}</a>,
    className: styles.titleColumn
  },
  {
    dataIndex: 'delete',
    render: (t, report) => <Button className={styles.deleteButton} danger type='text'>Delete</Button>,
    className: styles.deleteColumn
  }
]

function Reports ({ reports, createReportButton }) {
  if (reports.length === 0) {
    return (
      <div className={styles.reports}>
        <Result
          status='success'
          title='You are all set'
          subTitle='Get ready to create you first map with Dekart'
          extra={createReportButton}
        />
      </div>
    )
  } else {
    return (
      <div className={styles.reports}>
        <h1>Reports</h1>
        <Table
          dataSource={reports}
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

export default function HomePage () {
  const reportsList = useSelector(state => state.reportsList)
  const history = useHistory()
  const dispatch = useDispatch()
  const body = useRef()
  useEffect(() => {
    dispatch(subscribeReports())
    return () => dispatch(unsubscribeReports())
  }, [dispatch])
  const createReportButton = <Button icon={<PlusOutlined />} type='primary' onClick={() => dispatch(createReport(history))}>Create Report</Button>

  return (
    <div className={styles.homePage}>
      <Header>
        <div className={styles.headerButtons} />
        <DekartMenu />
        <div className={styles.headerButtons}>{reportsList.loaded && reportsList.reports.length ? createReportButton : null}</div>
      </Header>
      <div className={styles.body}>
        {
          reportsList.loaded
            ? <Reports
                reports={reportsList.reports}
                createReportButton={createReportButton}
                body={body}
              />
            : <Loading />
}
      </div>
    </div>
  )
}
