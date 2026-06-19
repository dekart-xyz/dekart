import { track } from '../lib/tracking'

export const UpgradeModalType = Object.freeze({
  CREATE_REPORT_LIMIT: 'create_report_limit'
})

export function showUpgradeModal (modalType = UpgradeModalType.CREATE_REPORT_LIMIT) {
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
