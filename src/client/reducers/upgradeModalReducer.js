import { showUpgradeModal, hideUpgradeModal } from '../actions/upgradeModal'

const defaultUpgradeModal = {
  visible: false,
  type: 'publish'
}

export function upgradeModal (state = defaultUpgradeModal, action) {
  switch (action.type) {
    case showUpgradeModal.name:
      return {
        ...state,
        visible: true,
        type: action.type
      }
    case hideUpgradeModal.name:
      return {
        ...state,
        visible: false
      }
    default:
      return state
  }
}
