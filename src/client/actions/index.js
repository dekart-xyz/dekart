import { showDatasetTable, toggleModal } from '@dekart-xyz/kepler.gl/dist/actions'

export function showDataTable (query) {
  return (dispatch) => {
    dispatch(showDatasetTable(query.id))
    dispatch(toggleModal('dataTable'))
  }
}

export * from './query'
export * from './file'
export * from './report'
export * from './env'
export * from './message'
export * from './clipboard'
export * from './version'
export * from './dataset'
