import { showDatasetTable, toggleModal } from '@dekart-xyz/kepler.gl/dist/actions'

export function showDataTable (datasetId) {
  return (dispatch) => {
    dispatch(showDatasetTable(datasetId))
    dispatch(toggleModal('dataTable'))
  }
}
