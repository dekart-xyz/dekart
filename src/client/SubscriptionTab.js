import Tag from 'antd/es/tag'
import styles from './SubscriptionTab.module.css'
import Title from 'antd/es/typography/Title'
import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import Button from 'antd/es/button'
import { createSubscription, redirectToCustomerPortal } from './actions/workspace'
import { PlanType } from '../proto/dekart_pb'
import { HomeOutlined, TeamOutlined, CheckCircleOutlined } from '@ant-design/icons'
import Text from 'antd/es/typography/Text'
import Card from 'antd/es/card'

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

function Plan ({ title, children, planType, cancelAt, addedUsersCount }) {
  const [hover, setHover] = useState(false)
  const user = useSelector(state => state.user)
  const dispatch = useDispatch()
  const [waitForRedirect, setWaitForRedirect] = useState(false)
  let actionButton = (
    <Button
      key='1' type={hover ? 'primary' : 'default'}
      disabled={waitForRedirect} loading={waitForRedirect}
      onClick={() => {
        setWaitForRedirect(true)
        dispatch(createSubscription(planType))
      }} ghost={hover}
    >Choose plan
    </Button>
  )
  if (planType === PlanType.TYPE_PERSONAL) {
    if (user.planType === PlanType.TYPE_TEAM) {
      actionButton = (
        <Button disabled title='Downgrading from Team to Personal is not supported'>Choose plan</Button>
      )
    } else if (user.planType === PlanType.TYPE_PERSONAL) {
      actionButton = <Button disabled>Current plan</Button>
    } else if (addedUsersCount > 1) {
      actionButton = (
        <Button disabled title='Workspace has more then one member'>Choose plan</Button>
      )
    }
  }
  if (planType === PlanType.TYPE_TEAM && user.planType === PlanType.TYPE_TEAM) {
    actionButton = (
      <>
        <Button
          disabled={waitForRedirect} loading={waitForRedirect} onClick={() => {
            setWaitForRedirect(true)
            dispatch(redirectToCustomerPortal())
          }}
        >Manage subscription
        </Button>
        {cancelAt ? (<div className={styles.cancelAt}>Cancels {(new Date(1000 * cancelAt)).toLocaleString()}</div>) : null}
      </>
    )
  }
  // const subscription = useSelector(state => state.workspace.subscription)
  return (
    <Card
      hoverable
      type='inner'
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={title}
      style={{ width: 300 }}
      actions={[actionButton]}
    >{children}
    </Card>
  )
}

function Plans () {
  const user = useSelector(state => state.user)
  const workspace = useSelector(state => state.workspace)
  return (
    <div className={styles.plans}>
      <Plan
        addedUsersCount={workspace.addedUsersCount}
        title={<PlanTitle
          icon={<HomeOutlined />}
          name='personal'
          selected={user.planType === PlanType.TYPE_PERSONAL}
          price='$0'
          description='for personal use and evaluation'
               />}
        planType={PlanType.TYPE_PERSONAL}
      >
        <p><Text type='success'><CheckCircleOutlined /> </Text><Text>Query data from BigQuery</Text></p>
        <p><Text type='success'><CheckCircleOutlined /> </Text><Text> Access private datasets</Text></p>
        <p><Text type='success'><CheckCircleOutlined /> </Text><Text> Unlimited maps</Text></p>
        <p><Text>No collaborators</Text></p>
      </Plan>
      <Plan
        addedUsersCount={workspace.addedUsersCount}
        title={<PlanTitle
          icon={<TeamOutlined />}
          name='team'
          price='$100/month'
          selected={user.planType === PlanType.TYPE_TEAM}
          description='for teams up to 20 people'
               />}
        planType={PlanType.TYPE_TEAM}
        cancelAt={workspace?.subscription?.cancelAt}
      >
        <p><Text type='success'><CheckCircleOutlined /> </Text><Text> Query data from BigQuery</Text></p>
        <p><Text type='success'><CheckCircleOutlined /> </Text><Text> Access private datasets</Text></p>
        <p><Text type='success'><CheckCircleOutlined /> </Text><Text> Unlimited maps</Text></p>
        <p><Text type='success'><CheckCircleOutlined /> Up to 20 collaborators</Text></p>
      </Plan>
    </div>
  )
}

export default function SubscriptionTab () {
  const user = useSelector(state => state.user)
  if (!user) {
    return null
  }
  return (
    <div className={styles.subscriptionTab}>
      <Plans />
    </div>
  )
}
