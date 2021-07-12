import { showDatasetTable, toggleModal } from '@dekart-xyz/kepler.gl/dist/actions'

export function showDataTable (query) {
  return (dispatch) => {
    dispatch(showDatasetTable(query.id))
    dispatch(toggleModal('dataTable'))
  }
}

export * from './query'
export * from './report'
export * from './job'
export * from './env'
export * from './message'
export * from './clipboard'
