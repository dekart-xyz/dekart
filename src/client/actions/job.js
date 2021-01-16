import { downloading, error, finishDownloading } from './message'
import { addDataToMap, toggleSidePanel } from 'kepler.gl/actions'
import { processCsvData } from 'kepler.gl/dist/processors'
import { get } from '../lib/api'
import Downloading from '../Downloading'

export function downloadJobResults (query) {
  return async (dispatch, getState) => {
    dispatch({ type: downloadJobResults.name, query })
    dispatch(downloading())
    let csv
    try {
      const res = await get(`/job-results/${query.jobResultId}.csv`)
      Downloading.setSize(Number(res.headers.get('Content-Length')))
      dispatch(jobResultSize(query, Number(res.headers.get('Content-Length'))))
      csv = await res.text()
    } catch (err) {
      dispatch(error(err))
    }
    const data = processCsvData(csv)
    dispatch(addDataToMap({
      datasets: {
        info: {
          label: 'Dataset',
          id: query.id
        },
        data
      }
    }))
    dispatch(finishDownloading())
    const { reportStatus } = getState()
    if (reportStatus.edit) {
      dispatch(toggleSidePanel('layer'))
    }
  }
}

export function jobResultSize (query, size) {
  return { type: jobResultSize.name, query, size }
}
