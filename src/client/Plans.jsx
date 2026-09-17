import Tag from 'antd/es/tag'
import styles from './Plans.module.css'
import Title from 'antd/es/typography/Title'
import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import Button from 'antd/es/button'
import { createSubscription, redirectToCustomerPortal } from './actions/workspace'
import { PlanType } from 'dekart-proto/dekart_pb'
import { CheckOutlined } from '@ant-design/icons'
import Text from 'antd/es/typography/Text'
import Tooltip from 'antd/es/tooltip'
import classNames from 'classnames'
import { track } from './lib/tracking'
import PricingBlock from './PricingBlock'

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

function ManageSubscriptionButton ({ disabled, loading, cancelAt, onManage }) {
  return (
    <>
      <Button
        disabled={disabled}
        loading={loading}
        onClick={onManage}
        type='default'
        className={styles.actionButton}
      >
        Manage subscription
      </Button>
      {Boolean(cancelAt) && (
        <div className={styles.cancelAt}>
          Cancels {(new Date(1000 * cancelAt)).toLocaleDateString()}
        </div>
      )}
    </>
  )
}

export function Plan ({ title, children, planType, cancelAt, isCurrentPlan, primaryAction }) {
  const [hover, setHover] = useState(false)
  const userStream = useSelector(state => state.user.stream)
  const dispatch = useDispatch()
  const [waitForRedirect, setWaitForRedirect] = useState(false)
  const isAdmin = useSelector(state => state.user.isAdmin)
  const workspace = useSelector(state => state.workspace)

  let actionButton = (
    <Button
      key='1'
      type={isCurrentPlan || primaryAction ? 'primary' : (hover ? 'primary' : 'default')}
      id={`dekart-${planType}-choose-plan`}
      disabled={waitForRedirect || !isAdmin}
      loading={waitForRedirect}
      onClick={() => {
        track(userStream.planType === PlanType.TYPE_TRIAL ? 'UpgradeFromTrial' : 'ChoosePlan', { planType })
        setWaitForRedirect(true)
        dispatch(createSubscription(planType))
      }}
      ghost={hover && !isCurrentPlan && !primaryAction}
      className={styles.actionButton}
    >
      {isCurrentPlan ? 'Continue' : 'Upgrade'}
    </Button>
  )

  // Active paid plans use the customer portal instead of starting another checkout.
  if (planType === userStream.planType && !workspace?.subscription?.expired) {
    actionButton = (
      <ManageSubscriptionButton
        disabled={waitForRedirect || !isAdmin}
        loading={waitForRedirect}
        cancelAt={cancelAt}
        onManage={() => {
          track('ManageSubscription')
          setWaitForRedirect(true)
          dispatch(redirectToCustomerPortal())
        }}
      />
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

// TrialStatusCard shows remaining trial time and the single upgrade action.
function TrialStatusCard () {
  const cancelAt = useSelector(state => state.workspace.subscription?.cancelAt)
  const daysLeft = Math.max(0, Math.min(14, Math.ceil(((cancelAt || 0) * 1000 - Date.now()) / (24 * 60 * 60 * 1000))))
  const daysLabel = daysLeft === 1 ? '1 day left' : `${daysLeft} days left`
  const trialPercent = `${Math.round((daysLeft / 14) * 100)}%`

  return (
    <div className={styles.trialStatus}>
      <div className={styles.trialStatusHeader}>
        <div className={styles.trialDays}>
          <strong>{daysLabel}</strong>
          <span>of your 14-day trial</span>
        </div>
        <div className={styles.trialSummary}>Unlimited maps, editors, viewers and database connections.</div>
      </div>
      <div className={styles.trialProgress}>
        <div style={{ width: trialPercent }} />
      </div>
      <div className={styles.trialNotice}>When the trial ends, your workspace becomes read-only and your maps stay viewable.</div>
    </div>
  )
}

// TrialEndedCard replaces the active-trial progress with the recovery actions.
function TrialEndedCard ({ isAdmin }) {
  return (
    <div className={styles.trialEnded}>
      <div>
        <div className={styles.trialEndedHeadline}>Your trial has ended</div>
        <div className={styles.trialEndedDescription}>
          {isAdmin
            ? 'The workspace is read-only and your maps stay viewable. Upgrade below to start editing again, or book a call to extend the trial.'
            : 'The workspace is read-only and your maps stay viewable. Ask your workspace admin to upgrade, or book a call to extend the trial.'}
        </div>
      </div>
      <Button
        href='https://calendly.com/vladi-dekart/meet-vladi'
        target='_blank'
        rel='noreferrer'
        onClick={() => track('BookCallFromTrialEndedCard')}
      >Book a call
      </Button>
    </div>
  )
}

export default function Plans () {
  const userStream = useSelector(state => state.user.stream)
  const workspace = useSelector(state => state.workspace)
  const isAdmin = useSelector(state => state.user.isAdmin)
  const isTrial = userStream.planType === PlanType.TYPE_TRIAL
  const trialExpired = isTrial && workspace.subscription?.expired
  return (
    <div className={styles.plans}>
      {trialExpired ? <TrialEndedCard isAdmin={isAdmin} /> : isTrial ? <TrialStatusCard /> : null}
      <div className={styles.planGrid}>
        {userStream.planType === PlanType.TYPE_TEAM
          ? (
            <Plan
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
                <CheckOutlined className={styles.checkIcon} />
                <Text>Everything from Personal</Text>
              </div>
              <div className={styles.feature}>
                <CheckOutlined className={styles.checkIcon} />
                <Text>Unlimited Maps</Text>
              </div>
              <div className={styles.feature}>
                <CheckOutlined className={styles.checkIcon} />
                <Text>20 seats included</Text>
              </div>
            </Plan>
            )
          : null}
        <Plan
          title={<PricingBlock planType={PlanType.TYPE_GROW} />}
          planType={PlanType.TYPE_GROW}
          cancelAt={workspace?.subscription?.cancelAt}
          isCurrentPlan={userStream.planType === PlanType.TYPE_GROW}
          primaryAction={isTrial}
        >
          <div className={styles.feature}>
            <CheckOutlined className={styles.checkIcon} />
            <Text>Unlimited maps and database connectors</Text>
          </div>
          <div className={styles.feature}>
            <CheckOutlined className={styles.checkIcon} />
            <Text>Unlimited viewers, always free</Text>
          </div>
        </Plan>
        <Plan
          title={<PricingBlock planType={PlanType.TYPE_MAX} />}
          planType={PlanType.TYPE_MAX}
          cancelAt={workspace?.subscription?.cancelAt}
          isCurrentPlan={userStream.planType === PlanType.TYPE_MAX}
        >
          <div className={styles.feature}>
            <CheckOutlined className={styles.checkIcon} />
            <Text>Everything in Grow</Text>
          </div>
          <div className={styles.feature}>
            <CheckOutlined className={styles.checkIcon} />
            <Text>Unlimited editors</Text>
          </div>
        </Plan>
      </div>
    </div>
  )
}
