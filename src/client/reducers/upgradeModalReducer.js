import { showUpgradeModal, hideUpgradeModal } from '../actions/upgradeModal'

const defaultUpgradeModal = {
  visible: false,
  modalType: 'publish'
}

export function upgradeModal (state = defaultUpgradeModal, action) {
  switch (action.type) {
    case showUpgradeModal.name:
      return {
        ...state,
        visible: true,
        modalType: action.modalType
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
