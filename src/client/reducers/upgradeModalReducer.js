import { showUpgradeModal, hideUpgradeModal, UpgradeModalType } from '../actions/upgradeModal'

const defaultUpgradeModal = {
  visible: false,
  modalType: UpgradeModalType.PUBLISH,
  numberOfSameCompanyWorkspaces: 0,
  sameCompanyWorkspaceOwners: []
}

export function upgradeModal (state = defaultUpgradeModal, action) {
  switch (action.type) {
    case showUpgradeModal.name:
      return {
        ...state,
        visible: true,
        modalType: action.modalType,
        numberOfSameCompanyWorkspaces: action.payload?.numberOfSameCompanyWorkspaces || 0,
        sameCompanyWorkspaceOwners: action.payload?.sameCompanyWorkspaceOwners || []
      }
    case hideUpgradeModal.name:
      return {
        ...state,
        visible: false,
        numberOfSameCompanyWorkspaces: 0,
        sameCompanyWorkspaceOwners: []
      }
    default:
      return state
  }
}
