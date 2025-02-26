export function shouldAddQuery (queryJob, prevQueryJobList, mapConfigUpdated) {
  if (!queryJob?.jobResultId) {
    return false
  } else if (mapConfigUpdated) {
    return true
  }
  if (!prevQueryJobList) {
    return true
  }
  const prevQueryJobState = prevQueryJobList.find(q => q.id === queryJob.id)
  if (!prevQueryJobState || prevQueryJobState.jobResultId !== queryJob.jobResultId) {
    return true
  }
  return false
}
