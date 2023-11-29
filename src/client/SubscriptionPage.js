import Card from 'antd/es/card'
import { Header } from './Header'
import styles from './SubscriptionPage.module.css'
import Tag from 'antd/es/tag'
import { GithubOutlined, HomeOutlined, TeamOutlined, CheckCircleOutlined, HighlightOutlined, LockFilled, CheckCircleFilled, DownOutlined } from '@ant-design/icons'
import Title from 'antd/es/typography/Title'
import Text from 'antd/es/typography/Text'
import Button from 'antd/es/button'
import { useState } from 'react'
import { cancelSubscription, createSubscription } from './actions/subscription'
import { useDispatch, useSelector } from 'react-redux'
import { PlanType } from '../proto/dekart_pb'
import Dropdown from 'antd/es/dropdown'
import Modal from 'antd/es/modal/Modal'

function PlanTitle ({ name, price, icon, color, description, selected }) {
  return (
    <div className={styles.planTitle}>
      <div className={styles.planTitleText}>
        <Tag icon={icon} color={selected ? '#108ee9' : undefined}>{name}</Tag>
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

function Plan ({ title, children, action, planType }) {
  const [hover, setHover] = useState(false)
  const dispatch = useDispatch()
  const subscription = useSelector(state => state.subscription)
  return (
    <Card
      hoverable
      type='inner'
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={title}
      style={{ width: 300 }}
      actions={[
        subscription.planType === planType
          ? (
            <Button
              key='1' disabled
            >Current plan
            </Button>
            )
          : (
            <Button
              key='1' type={hover ? 'primary' : 'default'} onClick={() => {
                dispatch(createSubscription(planType))
              }} ghost={hover}
            >{action}
            </Button>
            )
      ]}
    >{children}
    </Card>
  )
}

function Plans () {
  const subscription = useSelector(state => state.subscription)
  if (!subscription) {
    return null
  }
  return (
    <div className={styles.plans}>
      <Plan
        title={<PlanTitle
          icon={<HomeOutlined />}
          name='personal'
          selected={subscription.planType === PlanType.TYPE_PERSONAL}
          price='$0'
          description='requires use of personal email'
               />}
        planType={PlanType.TYPE_PERSONAL}
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
          description='for teams up to 20 people'
               />}
        planType={PlanType.TYPE_TEAM}
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
          name='community'
          price='self-hosted'
          // color='geekblue'
          description='estimated cost ~$65/month'
               />}
        action={<>Go to documentation</>}
      >
        <p><Text><HighlightOutlined /> Requires Google Cloud access</Text></p>
        <p><Text><HighlightOutlined /> Requires deployment on premice</Text></p>
        <p><Text><HighlightOutlined /> Requires configuration</Text></p>
        <p><Text><HighlightOutlined /> Requires Google Cloud Storage</Text></p>
      </Plan>
    </div>
  )
}

export default function SubscriptionPage () {
  const user = useSelector(state => state.user)
  const subscription = useSelector(state => state.subscription)
  const dispatch = useDispatch()
  const menuProps = {
    items: [{
      label: 'Cancel subscription',
      danger: true,
      onClick: () => {
        Modal.confirm({
          title: 'Cancel subscription?',
          okText: 'Yes',
          okType: 'danger',
          cancelText: 'No',
          onOk: () => dispatch(cancelSubscription())
        })
      }
    }]
  }
  return (
    <div className={styles.subscriptionPage}>
      <Header />
      {
        user
          ? (
            <div className={styles.body}>
              <div className={styles.title}>
                <Title>
                  {user.subscriptionActive ? <span className={styles.titleCheck}><CheckCircleFilled /></span> : <span className={styles.titleLock}><LockFilled /></span>}
                  <> Subscription</>
                </Title>
              </div>
              <Plans />
              {subscription && subscription.active
                ? (
                  <div className={styles.bottomPannel}>
                    <div className={styles.manageSubscription}>
                      <Dropdown menu={menuProps}>
                        <Button>
                          Manage subscription
                          <DownOutlined />
                        </Button>
                      </Dropdown>
                    </div>
                  </div>
                  )
                : null}
            </div>
            )
          : null
      }
    </div>
  )
}
