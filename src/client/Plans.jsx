import Tag from 'antd/es/tag'
import styles from './Plans.module.css'
import Title from 'antd/es/typography/Title'
import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import Button from 'antd/es/button'
import { createSubscription, redirectToCustomerPortal } from './actions/workspace'
import { PlanType } from 'dekart-proto/dekart_pb'
import { CheckCircleOutlined } from '@ant-design/icons'
import Text from 'antd/es/typography/Text'
import Tooltip from 'antd/es/tooltip'
import classNames from 'classnames'

export function PlanTitle ({ name, price, icon, color, description, selected }) {
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

export function Plan ({ title, children, planType, cancelAt, addedUsersCount, isCurrentPlan }) {
  const [hover, setHover] = useState(false)
  const userStream = useSelector(state => state.user.stream)
  const dispatch = useDispatch()
  const [waitForRedirect, setWaitForRedirect] = useState(false)
  const isAdmin = useSelector(state => state.user.isAdmin)

  let actionButton = (
    <Button
      key='1'
      type={isCurrentPlan ? 'primary' : (hover ? 'primary' : 'default')}
      id={`dekart-${planType}-choose-plan`}
      disabled={waitForRedirect || !isAdmin}
      loading={waitForRedirect}
      onClick={() => {
        setWaitForRedirect(true)
        dispatch(createSubscription(planType))
      }}
      ghost={hover && !isCurrentPlan}
      className={styles.actionButton}
    >
      Choose plan
    </Button>
  )

  if (planType === PlanType.TYPE_PERSONAL) {
    if (userStream.planType !== PlanType.TYPE_PERSONAL) {
      actionButton = (
        <Button disabled title='Downgrading from Team to Personal is not supported' className={styles.actionButton}>
          Choose plan
        </Button>
      )
    } else if (userStream.planType === PlanType.TYPE_PERSONAL) {
      actionButton = <Button disabled className={styles.actionButton}>Current plan</Button>
    }
  } else if (planType === userStream.planType) {
    actionButton = (
      <>
        <Button
          disabled={waitForRedirect || !isAdmin}
          loading={waitForRedirect}
          onClick={() => {
            setWaitForRedirect(true)
            dispatch(redirectToCustomerPortal())
          }}
          className={styles.actionButton}
        >
          Manage subscription
        </Button>
        {cancelAt ? (<div className={styles.cancelAt}>Cancels {(new Date(1000 * cancelAt)).toLocaleString()}</div>) : null}
      </>
    )
  }

  return (
    <div
      className={classNames(styles.planCard, { [styles.current]: isCurrentPlan })}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className={styles.planHeader}>
        {title}
      </div>

      <div className={styles.features}>
        {children}
      </div>

      <div className={styles.actionContainer}>
        {actionButton}
      </div>
    </div>
  )
}

export default function Plans () {
  const userStream = useSelector(state => state.user.stream)
  const workspace = useSelector(state => state.workspace)
  return (
    <div className={styles.plans}>
      {userStream.planType !== PlanType.TYPE_TEAM && (
        <Plan
          addedUsersCount={workspace.addedUsersCount}
          title={<PlanTitle
            name='Personal'
            selected={userStream.planType === PlanType.TYPE_PERSONAL}
            price='Free'
            description='Single-person use'
                 />}
          planType={PlanType.TYPE_PERSONAL}
          isCurrentPlan={userStream.planType === PlanType.TYPE_PERSONAL}
        >
          <div className={styles.feature}>
            <CheckCircleOutlined className={styles.checkIcon} />
            <Text>Unlimited Private Maps</Text>
          </div>
          <div className={styles.feature}>
            <CheckCircleOutlined className={styles.checkIcon} />
            <Text>Unlimited Connectors</Text>
          </div>
          <div className={styles.feature}>
            <CheckCircleOutlined className={styles.checkIcon} />
            <Text>1 Shared Map</Text>
          </div>
        </Plan>

      )}
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
            isCurrentPlan={userStream.planType === PlanType.TYPE_TEAM}
          >
            <div className={styles.feature}>
              <CheckCircleOutlined className={styles.checkIcon} />
              <Text>Everything from Personal</Text>
            </div>
            <div className={styles.feature}>
              <CheckCircleOutlined className={styles.checkIcon} />
              <Text>Unlimited Shared Maps</Text>
            </div>
            <div className={styles.feature}>
              <CheckCircleOutlined className={styles.checkIcon} />
              <Text>Unlimited Workspace Viewers</Text>
            </div>
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
        isCurrentPlan={userStream.planType === PlanType.TYPE_GROW}
      >
        <div className={styles.feature}>
          <CheckCircleOutlined className={styles.checkIcon} />
          <Text>Everything from Personal</Text>
        </div>
        <div className={styles.feature}>
          <CheckCircleOutlined className={styles.checkIcon} />
          <Text>Unlimited Shared Maps</Text>
        </div>
        <div className={styles.feature}>
          <CheckCircleOutlined className={styles.checkIcon} />
          <Text>Unlimited Viewers</Text>
        </div>
        <div className={styles.feature}>
          <CheckCircleOutlined className={styles.checkIcon} />
          <Text>Manage Access</Text>
        </div>
        <div className={styles.feature}>
          <CheckCircleOutlined className={styles.checkIcon} />
          <Text>Capture viewers emails</Text>
        </div>
      </Plan>
      <Plan
        addedUsersCount={workspace.addedUsersCount}
        title={<PlanTitle
          name='Max'
          price='$490/month'
          selected={userStream.planType === PlanType.TYPE_MAX}
          description='Unlimited'
               />}
        planType={PlanType.TYPE_MAX}
        cancelAt={workspace?.subscription?.cancelAt}
        isCurrentPlan={userStream.planType === PlanType.TYPE_MAX}
      >
        <div className={styles.feature}>
          <CheckCircleOutlined className={styles.checkIcon} />
          <Text>Everything from Grow</Text>
        </div>
        <div className={styles.feature}>
          <CheckCircleOutlined className={styles.checkIcon} />
          <Text>Unlimited Editors</Text>
        </div>
        <div className={styles.feature}>
          <CheckCircleOutlined className={styles.checkIcon} />
          <Text>Unlimited Admins</Text>
        </div>
      </Plan>
    </div>
  )
}
