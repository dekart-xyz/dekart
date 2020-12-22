import { combineReducers } from 'redux'
import keplerGlReducer from 'kepler.gl/reducers'

const customKeplerGlReducer = keplerGlReducer.initialState({
  uiState: {
    currentModal: null
    // activeSidePanel: null
  }
})

function keplerGl (state, action) {
  console.log('keplerGl', state)
  return customKeplerGlReducer(state, action)
}

export default combineReducers({
  keplerGl
})
