import { showDatasetTable, toggleModal } from '@kepler.gl/actions'

export function showDataTable (datasetId) {
  return (dispatch) => {
    dispatch(showDatasetTable(datasetId))
    dispatch(toggleModal('dataTable'))
  }
}
