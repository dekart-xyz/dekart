import { combineReducers } from 'redux'
import { addReadme, removeReadme, setPreview, setReadmeValue, showReadmeTab } from '../actions/readme'
import { reportUpdate } from '../actions/report'
import { setActiveDataset } from '../actions/dataset'

function showPreview (state = true, action) {
  switch (action.type) {
    case setPreview.name:
      return action.show
    case addReadme.name:
      return false
    default:
      return state
  }
}

function showTab (state = true, action) {
  switch (action.type) {
    case reportUpdate.name: {
      const { readme } = action.report
      return readme ? state : false
    }
    case addReadme.name:
    case showReadmeTab.name:
      return true
    case removeReadme.name:
    case setActiveDataset.name:
      return false
    default:
      return state
  }
}

function markdown (state = null, action) {
  switch (action.type) {
    case setReadmeValue.name:
    case addReadme.name:
      return action.markdown
    case reportUpdate.name: {
      const { readme } = action.report
      return readme && state === null ? readme.markdown : state
    }
    default:
      return state
  }
}

export default combineReducers({
  showPreview,
  markdown,
  showTab
})
