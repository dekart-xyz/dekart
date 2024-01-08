import styles from './Onboarding.module.css'

export default function Onboarding ({ icon, title, steps }) {
  return (
    <div className={styles.onboarding}>
      <div className={styles.onboardingIcon}>{icon}</div>
      <div className={styles.onboardingContent}>
        <div className={styles.onboardingTitle}>{title}</div>
        <div className={styles.onboardingSteps}>{steps}</div>
      </div>
    </div>
  )
}
