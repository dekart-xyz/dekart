import { AddReadmeRequest } from 'dekart-proto/dekart_pb'
import { Dekart } from 'dekart-proto/dekart_pb_service'
import { track } from '../lib/tracking'
import { grpcCall } from './grpc'
import { saveMap, waitForReportSave } from './report'

export function removeReadme () {
  return async (dispatch, getState) => {
    const reportId = getState().report.id
    await waitForReportSave()
    // Navigation while the save is pending must not delete a different report's README.
    if (getState().report?.id !== reportId) return false
    dispatch({ type: removeReadme.name })
    dispatch(setReadmeValue(null))
    // Save removal with the report revision so an overlapping save cannot restore old text.
    return dispatch(saveMap())
  }
}

export function addReadme (datasetId) {
  return (dispatch, getState) => {
    track('AddReadme')
    const markdown = `# My Readme

Use **Markdown** to document your map:
- Summarize data sources
- Explain query logic
- Provide usage instructions or insights for collaborators

*Click the Preview button to see the rendered version.*
`
    dispatch({ type: addReadme.name, markdown })
    const reportId = getState().report.id
    const request = new AddReadmeRequest()
    request.setReportId(reportId)
    request.setMarkdown(markdown)
    request.setFromDatasetId(datasetId)
    dispatch(grpcCall(Dekart.AddReadme, request))
  }
}

export function setPreview (show) {
  return (dispatch) => {
    dispatch({ type: setPreview.name, show })
  }
}

export function setReadmeValue (markdown) {
  return (dispatch) => {
    dispatch({ type: setReadmeValue.name, markdown })
  }
}

export function showReadmeTab () {
  return (dispatch) => {
    dispatch({ type: showReadmeTab.name })
  }
}
