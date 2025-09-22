export function showUpgradeModal (type = 'publish') {
  return {
    type: showUpgradeModal.name,
    type
  }
}

export function hideUpgradeModal () {
  return {
    type: hideUpgradeModal.name
  }
}
