import { getReportStream } from './lib/grpc'
import { get } from './lib/api'
import { processCsvData } from 'kepler.gl/dist/processors'
import { addDataToMap } from 'kepler.gl/actions'

let reportStreamCancelable

export function closeReport (reportId) {
  return (dispatch) => {
    if (reportStreamCancelable) {
      reportStreamCancelable.cancel()
    }
    dispatch({
      type: openReport.name
    })
  }
}

export function openReport (reportId) {
  return (dispatch) => {
    dispatch({
      type: openReport.name
    })
    reportStreamCancelable = getReportStream(reportId, (reportStreamResponse) => {
      dispatch(reportUpdate(reportStreamResponse))
    })
  }
}

export function reportUpdate (reportStreamResponse) {
  const { report, queriesList } = reportStreamResponse
  return async (dispatch) => {
    dispatch({
      type: reportUpdate.name,
      report,
      queriesList
    })
    await Promise.all(queriesList.map(async (query, i) => {
      if (query.jobResultId) {
        const res = await get(`/job-results/${query.jobResultId}.csv`)
        const csv = await res.text()
        const data = processCsvData(csv)
        dispatch(addDataToMap({
          datasets: {
            info: {
              label: `Dataset ${i}`,
              id: query.jobResultId
            },
            data
          }
        }))
      }
    }))
    // queriesList.forEach(query => {
    //   if (query.jobResultId) {
    //     console.log(query.jobResultId)
    //   }
    // })
  }
}
