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

function shouldAddDataset (query, queriesList) {
  if (!query.jobResultId) {
    return false
  }
  if (!queriesList) {
    return true
  }
  const prevQueryState = queriesList.find(q => q.id === query.id)
  if (!prevQueryState || prevQueryState.jobResultId !== query.jobResultId) {
    return true
  }
  return false
}

export function reportUpdate (reportStreamResponse) {
  const { report, queriesList } = reportStreamResponse
  console.log('queriesList', queriesList)
  return async (dispatch, getState) => {
    dispatch({
      type: reportUpdate.name,
      report,
      queriesList
    })
    const { prevQueriesList } = getState()
    await Promise.all(queriesList.map(async (query, i) => {
      if (shouldAddDataset(query, prevQueriesList)) {
        const res = await get(`/job-results/${query.jobResultId}.csv`)
        const csv = await res.text()
        const data = processCsvData(csv)
        dispatch(addDataToMap({
          datasets: {
            info: {
              label: `Dataset ${i}`,
              id: query.id
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
