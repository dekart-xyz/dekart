import { track } from '../lib/tracking'

export function showUpgradeModal (modalType = 'publish') {
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
