import { track } from '../lib/tracking'

export const UpgradeModalType = Object.freeze({
  PUBLISH: 'publish',
  DIRECT_ACCESS: 'direct_access',
  ANALYTICS: 'analytics',
  INVITE: 'invite',
  CREATE_REPORT_LIMIT: 'create_report_limit'
})

export function showUpgradeModal (modalType = UpgradeModalType.PUBLISH, payload = {}) {
  track('UpgradeModalOpened' + modalType.charAt(0).toUpperCase() + modalType.slice(1))
  return {
    type: showUpgradeModal.name,
    modalType,
    payload
  }
}

export function hideUpgradeModal () {
  return {
    type: hideUpgradeModal.name
  }
}
