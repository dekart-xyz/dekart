// goToPresent redirects to the present view while preserving the current query params
export function goToPresent (history, id) {
  const searchParams = new URLSearchParams(window.location.search)
  history.replace(`/reports/${id}?${searchParams.toString()}`)
}

// goToSource redirects to the source view while preserving the current query params
export function goToSource (history, id) {
  const searchParams = new URLSearchParams(window.location.search)
  history.replace(`/reports/${id}/source?${searchParams.toString()}`)
}
