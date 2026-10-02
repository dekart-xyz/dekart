import keplerGlReducer from '@kepler.gl/reducers'
import { ActionTypes as KeplerActionTypes } from '@kepler.gl/actions'
import { setUserMapboxAccessTokenUpdater } from '@kepler.gl/reducers/dist/ui-state-updaters'
import { createFilterRestore } from '../dark/kepler-filter-restore/index'

const customKeplerGlReducer = keplerGlReducer.initialState({
  uiState: {
    currentModal: null,
    activeSidePanel: null
  },
  mapStyle: {
    styleType: 'dark'
  }
})

// Preserve application notification and export settings around Kepler reduction.
function keplerGl (state, action) {
  const newState = customKeplerGlReducer(state, action)
  switch (action.type) {
    case KeplerActionTypes.LOAD_FILES_ERR:
      if (!newState?.kepler) {
        return state
      }
      // Keep Kepler's load-files task completion, but let Dekart show the user-facing download error.
      return {
        ...newState,
        kepler: {
          ...newState.kepler,
          uiState: {
            ...newState.kepler.uiState,
            notifications: state?.kepler?.uiState?.notifications || []
          }
        }
      }
    case KeplerActionTypes.REGISTER_ENTRY:
      // set mapbox token for map export
      newState.kepler.uiState = setUserMapboxAccessTokenUpdater(newState.kepler.uiState, {
        payload: newState.kepler.mapStyle.mapboxApiAccessToken
      })
      return newState
    default:
      return newState
  }
}

export const filterRestore = createFilterRestore({
  keplerInstanceId: 'kepler',
  keplerReducer: keplerGl
})

export default filterRestore.reducer
