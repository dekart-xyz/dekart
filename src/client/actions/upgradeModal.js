import { track } from '../lib/tracking'

export const UpgradeModalType = Object.freeze({
  PUBLISH: 'publish',
  DIRECT_ACCESS: 'direct_access',
  ANALYTICS: 'analytics',
  INVITE: 'invite'
})

export function showUpgradeModal (modalType = UpgradeModalType.PUBLISH) {
  track('UpgradeModalOpened' + modalType.charAt(0).toUpperCase() + modalType.slice(1))
  return {
    type: showUpgradeModal.name,
    modalType
  }
}

export function hideUpgradeModal () {
  return {
    type: hideUpgradeModal.name
  }
}
