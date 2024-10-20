import Tag from 'antd/es/tag'
import styles from './SubscriptionTab.module.css'
import Title from 'antd/es/typography/Title'
import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import Button from 'antd/es/button'
import { createSubscription, redirectToCustomerPortal } from './actions/workspace'
import { PlanType } from '../proto/dekart_pb'
import { CheckCircleOutlined } from '@ant-design/icons'
import Text from 'antd/es/typography/Text'
import Card from 'antd/es/card'
import Tooltip from 'antd/es/tooltip'

function PlanTitle ({ name, price, icon, color, description, selected }) {
  return (
    <div className={styles.planTitle}>
      <div className={styles.planTitleText}>
        <Tag icon={icon} color={selected ? '#108ee9' : undefined}>{name}</Tag>
      </div>
      <div className={styles.planTitlePrice}>
        {price}
      </div>
      <div className={styles.planTitleDescription}>
        <Title level={5} type='secondary'>{description}</Title>
      </div>
    </div>
  )
}

function Plan ({ title, children, planType, cancelAt, addedUsersCount }) {
  const [hover, setHover] = useState(false)
  const userStream = useSelector(state => state.user.stream)
  const dispatch = useDispatch()
  const [waitForRedirect, setWaitForRedirect] = useState(false)
  const isAdmin = useSelector(state => state.user.isAdmin)
  let actionButton = (
    <Button
      key='1' type={hover ? 'primary' : 'default'}
      id={`dekart-${planType}-choose-plan`}
      disabled={waitForRedirect || !isAdmin} loading={waitForRedirect}
      onClick={() => {
        setWaitForRedirect(true)
        dispatch(createSubscription(planType))
      }} ghost={hover}
    >Choose plan
    </Button>
  )
  if (planType === PlanType.TYPE_PERSONAL) {
    if (userStream.planType > PlanType.TYPE_PERSONAL) {
      actionButton = (
        <Button disabled title='Downgrading from Team to Personal is not supported'>Choose plan</Button>
      )
    } else if (userStream.planType === PlanType.TYPE_PERSONAL) {
      actionButton = <Button disabled>Current plan</Button>
    } else if (addedUsersCount > 1) {
      actionButton = (
        <Button disabled title='Workspace has more then one member'>Choose plan</Button>
      )
    }
  } else if (planType === userStream.planType) {
    actionButton = (
      <>
        <Button
          disabled={waitForRedirect || !isAdmin} loading={waitForRedirect} onClick={() => {
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
  const userStream = useSelector(state => state.user.stream)
  const workspace = useSelector(state => state.workspace)
  return (
    <div className={styles.plans}>
      <Plan
        addedUsersCount={workspace.addedUsersCount}
        title={<PlanTitle
          name='Personal'
          selected={userStream.planType === PlanType.TYPE_PERSONAL}
          price='Free'
          description='Single-person use'
               />}
        planType={PlanType.TYPE_PERSONAL}
      >
        <p><Text type='success'><CheckCircleOutlined /> </Text><Text>BigQuery Connector</Text></p>
        <p><Text type='success'><CheckCircleOutlined /> </Text><Text>Snowflake Connector</Text></p>
        <p><Text type='success'><CheckCircleOutlined /> </Text><Text>Publish Maps Online</Text></p>
      </Plan>
      {userStream.planType === PlanType.TYPE_TEAM
        ? (
          <Plan
            addedUsersCount={workspace.addedUsersCount}
            title={<PlanTitle
              name='Team'
              price='$100/month'
              selected={userStream.planType === PlanType.TYPE_TEAM}
              description={<Tooltip placement='bottom' title='You can continue using Team plan. If you switch to another plan you will not be able to switch back.'><Tag color='red'>Deprecated</Tag></Tooltip>}
                   />}
            planType={PlanType.TYPE_TEAM}
            cancelAt={workspace?.subscription?.cancelAt}
          >
            <p><Text type='success'><CheckCircleOutlined /> </Text><Text>Everything from Personal</Text></p>
            <p><Text type='success'><CheckCircleOutlined /> </Text><Text>Manage Map Access</Text></p>
            <p>&nbsp;</p>
          </Plan>
          )
        : null}
      <Plan
        addedUsersCount={workspace.addedUsersCount}
        title={<PlanTitle
          name='Grow'
          price='$49/month'
          selected={userStream.planType === PlanType.TYPE_GROW}
          description='Per editor or admin'
               />}
        planType={PlanType.TYPE_GROW}
        cancelAt={workspace?.subscription?.cancelAt}
      >
        <p><Text type='success'><CheckCircleOutlined /> </Text><Text>Everything from Personal</Text></p>
        <p><Text type='success'><CheckCircleOutlined /> </Text><Text>Unlimited Map Viewers</Text></p>
        <p><Text type='success'><CheckCircleOutlined /> </Text><Text>Manage Map Access</Text></p>
      </Plan>
      <Plan
        addedUsersCount={workspace.addedUsersCount}
        title={<PlanTitle
          name='Max'
          price='$490/month'
          selected={userStream.planType === PlanType.TYPE_MAX}
          description='Unlimited users'
               />}
        planType={PlanType.TYPE_MAX}
        cancelAt={workspace?.subscription?.cancelAt}
      >
        <p><Text type='success'><CheckCircleOutlined /> </Text><Text>Everything from Personal</Text></p>
        <p><Text type='success'><CheckCircleOutlined /> </Text><Text>Unlimited editors and viewers</Text></p>
        <p><Text type='success'><CheckCircleOutlined /> </Text><Text>Manage Map Access</Text></p>
      </Plan>
    </div>
  )
}

export default function SubscriptionTab () {
  const userStream = useSelector(state => state.user.stream)
  if (!userStream) {
    return null
  }
  return (
    <div className={styles.subscriptionTab}>
      <Plans />
      <div className={styles.termsLink}><a href='https://dekart.xyz/legal/terms/' target='_blank' rel='noreferrer'>🎓 Terms and conditions</a></div>
      <div className={styles.notSure}>
        <Title level={2}>Not sure what plan to choose?</Title>
        <p><a href='https://calendly.com/vladi-dekart/30min' target='_blank' rel='noreferrer'>Book a call with the Dekart team</a> — Unlock insider discounts and learn about our roadmap.</p>
      </div>
    </div>
  )
}
