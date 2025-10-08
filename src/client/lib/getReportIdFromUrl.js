// getReportId parses /reports/<report_id>/... url and returns report_id
export function getReportIdFromUrl () {
  const url = window.location.pathname
  const isReportPath = url.match(/^\/reports\/([a-f0-9-]+)/)
  if (isReportPath && isReportPath[1]) {
    return isReportPath[1]
  }
  return ''
}
