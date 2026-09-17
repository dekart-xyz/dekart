import React from 'react'
import classNames from 'classnames'
import { PlanType } from 'dekart-proto/dekart_pb'
import styles from './PricingBlock.module.css'

const plans = {
  [PlanType.TYPE_GROW]: {
    name: 'Grow',
    price: '$49',
    interval: '/month per editor',
    description: 'Unlimited viewers, always free. Each additional editor is $49/month.'
  },
  [PlanType.TYPE_MAX]: {
    name: 'Max',
    price: '$490',
    interval: '/month',
    description: 'Unlimited editors and unlimited viewers.'
  }
}

// Price renders one canonical plan price and its billing explanation.
function Price ({ plan, variant }) {
  return (
    <div className={classNames(styles.plan, { [styles.trialPlan]: variant === 'trial' })}>
      <strong>{plan.name}</strong>
      <div className={styles.price}>{plan.price}<span className={styles.interval}>{plan.interval}</span></div>
      <div className={styles.description}>{plan.description}</div>
    </div>
  )
}

// PricingBlock keeps the trial acknowledgement and plans page pricing identical.
export default function PricingBlock ({ planType, variant }) {
  // Plan cards request one price while the acknowledgement shows both.
  if (planType) {
    return <Price plan={plans[planType]} variant={variant} />
  }
  return (
    <div className={styles.pricingBlock}>
      <Price plan={plans[PlanType.TYPE_GROW]} variant={variant} />
      <Price plan={plans[PlanType.TYPE_MAX]} variant={variant} />
    </div>
  )
}
