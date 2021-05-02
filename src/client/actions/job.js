import { downloading, error, finishDownloading } from './message'
import { addDataToMap, toggleSidePanel } from 'kepler.gl/actions'
import { processCsvData } from 'kepler.gl/dist/processors'
import { get } from '../lib/api'
// import Downloading from '../Downloading'

export function downloadJobResults (query) {
  return async (dispatch, getState) => {
    dispatch({ type: downloadJobResults.name, query })
    dispatch(downloading(query))
    let csv
    try {
      const res = await get(`/job-results/${query.jobResultId}.csv`)
      csv = await res.text()
    } catch (err) {
      dispatch(error(err))
    }
    const data = processCsvData(csv)
    dispatch(addDataToMap({
      datasets: {
        info: {
          label: 'Query',
          id: query.id
        },
        data
      }
    }))
    dispatch(finishDownloading(query))
    const { reportStatus } = getState()
    if (reportStatus.edit) {
      dispatch(toggleSidePanel('layer'))
    }
  }
}
