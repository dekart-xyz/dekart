import { useEffect } from 'react'
import { useHistory } from 'react-router-dom'
import DekartMenu from './DekartMenu'
import { Header } from './Header'
import styles from './HomePage.module.css'
import { Button, Result } from 'antd'
import { createReport } from './actions'
import { useDispatch } from 'react-redux'
import { AreaChartOutlined } from '@ant-design/icons'

export default function HomePage () {
  const history = useHistory()
  const dispatch = useDispatch()
  useEffect(() => {
    // redirectToReport(history).catch(console.error)
  })
  const createReportButton = <Button type='primary' onClick={() => dispatch(createReport(history))}>Create Report</Button>
  return (
    <div className={styles.homePage}>
      <Header>
        <DekartMenu />
      </Header>
      <div className={styles.body}>
        {/* {createReportButton} */}
        <div className={styles.reports}>
          <Result
            // icon={<AreaChartOutlined />}
            status='success'
            title='You are all set'
            subTitle='Get ready to create you first map with Dekart'
            extra={createReportButton}
          />
        </div>
      </div>
    </div>
  )
}
