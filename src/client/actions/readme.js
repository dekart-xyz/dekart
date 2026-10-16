import { AddReadmeRequest } from 'dekart-proto/dekart_pb'
import { Dekart } from 'dekart-proto/dekart_pb_service'
import { track } from '../lib/tracking'
import { grpcCall } from './grpc'

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
