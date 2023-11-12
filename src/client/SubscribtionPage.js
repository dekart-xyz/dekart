import Card from 'antd/es/card'
import { Header } from './Header'
import styles from './SubscribtionPage.module.css'
import Tag from 'antd/es/tag'
import { GithubOutlined, HomeOutlined, TeamOutlined, CheckCircleOutlined, HighlightOutlined, ExportOutlined } from '@ant-design/icons'
import Title from 'antd/es/typography/Title'
import Text from 'antd/es/typography/Text'
import Button from 'antd/es/button'
import { useState } from 'react'

function PlanTitle ({ name, price, icon, color, description }) {
  return (
    <div className={styles.planTitle}>
      <div className={styles.planTitleText}>
        <Tag icon={icon} color={color}>{name}</Tag>
      </div>
      <div className={styles.planTitlePrice}>
        <Title level={2}>{price}</Title>
      </div>
      <div className={styles.planTitleDescription}>
        <Title level={5} type='secondary'>{description}</Title>
      </div>
    </div>
  )
}

function Plan ({ title, children, action }) {
  const [hover, setHover] = useState(false)
  return (
    <Card
      hoverable
      type='inner'
      onMouseEnter={() => setHover(true)} // Add onMouseEnter event
      onMouseLeave={() => setHover(false)} // Add onMouseLeave event
      title={title}
      style={{ width: 300 }}
      actions={[<Button key='1' type={hover ? 'primary' : 'default'} ghost={hover}>{action}</Button>]}
    >{children}
    </Card>
  )
}

export default function SubscriptionPage () {
  return (
    <div className={styles.subscriptionPage}>
      <Header />
      <div className={styles.body}>
        <div className={styles.plans}>
          <Plan
            title={<PlanTitle
              icon={<HomeOutlined />}
              name='personal'
              price='$0'
            // color='geekblue'
              description='requires use of personal email'
                   />}
            action='Choose personal'
          >
            <p><Text type='success'><CheckCircleOutlined /> Access to private datasets</Text></p>
            <p><Text><CheckCircleOutlined /> <s>SSO with company email</s></Text></p>
            <p><Text><HighlightOutlined /> Requires Google Cloud access</Text></p>
            <p><Text><HighlightOutlined /> Requires Google Cloud Storage</Text></p>
          </Plan>
          <Plan
            title={<PlanTitle
              icon={<TeamOutlined />}
              name='team'
              price='$100/month'
              // color='rgb(87, 183, 211)'
              description='for teams up to 20 people'
                   />}
            action='Choose team'
          >
            <p><Text type='success'><CheckCircleOutlined /> Access to private datasets</Text></p>
            <p><Text type='success'><CheckCircleOutlined /> SSO with company email</Text></p>
            <p><Text><HighlightOutlined /> Requires Google Cloud access</Text></p>
            <p><Text><HighlightOutlined /> Requires Google Cloud Storage</Text></p>
          </Plan>
          <Plan
            title={<PlanTitle
              icon={<GithubOutlined />}
              name='self-hosted'
              price='~$65/month'
            // color='geekblue'
              description='estimated cost of self-hosting'
                   />}
            action={<>Go to documentation</>}
          >
            <p><Text><HighlightOutlined /> Requires Google Cloud access</Text></p>
            <p><Text><HighlightOutlined /> Requires deployment on premice</Text></p>
            <p><Text><HighlightOutlined /> Requires configuration</Text></p>
            <p><Text><HighlightOutlined /> Requires Google Cloud Storage</Text></p>
          </Plan>
        </div>
      </div>
    </div>
  )
}
