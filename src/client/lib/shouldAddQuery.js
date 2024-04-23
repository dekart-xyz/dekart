export function shouldAddQuery (query, prevQueriesList, gone) {
  console.log('shouldAddQuery', gone)
  if (!query.jobResultId) {
    return false
  }
  if (!prevQueriesList) {
    return true
  }
  if (gone.includes(query.jobResultId)) {
    console.log('shouldAddQuery skip')
    return false
  }
  const prevQueryState = prevQueriesList.find(q => q.id === query.id)
  if (!prevQueryState || prevQueryState.jobResultId !== query.jobResultId) {
    return true
  }
  return false
}
