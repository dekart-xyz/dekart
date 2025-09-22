export function showUpgradeModal (modalType = 'publish') {
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
