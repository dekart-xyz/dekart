export function shouldAddQuery (query, prevQueriesList, queriesList) {
  if (!query.jobResultId) {
    return false
  }
  if (!prevQueriesList) {
    return true
  }
  const prevQueryState = prevQueriesList.find(q => q.id === query.id)
  if (!prevQueryState || prevQueryState.jobResultId !== query.jobResultId) {
    return true
  }
  return false
}
