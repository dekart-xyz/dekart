import { downloading, error, finishDownloading } from './message'
import { addDataToMap, toggleSidePanel } from 'kepler.gl/dist/actions'
import { processCsvData } from 'kepler.gl/dist/processors'
import { get } from '../lib/api'
// import Downloading from '../Downloading'

export function downloadJobResults (query) {
  return async (dispatch, getState) => {
    dispatch({ type: downloadJobResults.name, query })
    const { queries } = getState()
    const i = queries.findIndex(q => q.id === query.id)
    if (i < 0) {
      return
    }
    dispatch(downloading(query))
    try {
      const res = await get(`/job-results/${query.jobResultId}.csv`)
      const csv = await res.text()
      const data = processCsvData(csv)
      dispatch(addDataToMap({
        datasets: {
          info: {
            label: `Query ${i + 1}`,
            id: query.id
          },
          data
        }
      }))
    } catch (err) {
      dispatch(error(err))
    }
    dispatch(finishDownloading(query))
    const { reportStatus } = getState()
    if (reportStatus.edit) {
      dispatch(toggleSidePanel('layer'))
    }
  }
}
