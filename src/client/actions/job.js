import { downloading, error, finishDownloading } from './message'
import { addDataToMap, toggleSidePanel } from '@dekart-xyz/kepler.gl/dist/actions'
import { processCsvData } from '@dekart-xyz/kepler.gl/dist/processors'
import { get } from '../lib/api'

export function downloadJobResults (query) {
  return async (dispatch, getState) => {
    dispatch({ type: downloadJobResults.name, query })
    const { queries } = getState()
    const i = queries.findIndex(q => q.id === query.id)
    if (i < 0) {
      return
    }
    dispatch(downloading(query))
    let data
    try {
      const res = await get(`/job-results/${query.jobResultId}.csv`)
      const csv = await res.text()
      data = processCsvData(csv)
    } catch (err) {
      dispatch(error(err))
      return
    }
    dispatch(addDataToMap({
      datasets: {
        info: {
          label: `Query ${i + 1}`,
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
