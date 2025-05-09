import styles from './Onboarding.module.css'

export default function Onboarding ({ icon, title, steps }) {
  return (
    <div className={styles.onboarding}>
      <div className={styles.onboardingIconWrapper}><div className={styles.onboardingIcon}>{icon}</div></div>
      <div className={styles.onboardingContent}>
        <div className={styles.onboardingTitle}>{title}</div>
        <div className={styles.onboardingSteps}>{steps}</div>
      </div>
    </div>
  )
}
