import { isDuckDBDataset } from './constants'

// buildDuckDBGraph orders streamed compiled jobs by their pinned DuckDB job revisions.
export function buildDuckDBGraph ({ datasets, queries, queryJobs, queryParamsHash }) {
  const datasetByQueryId = new Map(datasets.filter(dataset => dataset.queryId).map(dataset => [dataset.queryId, dataset]))
  const jobById = new Map(queryJobs.map(job => [job.id, job]))
  const currentJobs = new Map()
  queryJobs.forEach(job => {
    const key = `${job.queryId}\u0000${job.queryParamsHash}`
    if (!currentJobs.has(key)) currentJobs.set(key, job)
  })
  const roots = datasets
    .filter(dataset => isDuckDBDataset(dataset, queries))
    .map(dataset => currentJobs.get(`${dataset.queryId}\u0000${queryParamsHash}`))
    .filter(Boolean)
  const visited = new Set()
  const ordered = []

  function visit (queryJob, publish = false) {
    if (!queryJob || visited.has(queryJob.id)) {
      if (publish) {
        const existing = ordered.find(node => node.queryJob.id === queryJob?.id)
        if (existing) existing.publish = true
      }
      return
    }
    visited.add(queryJob.id)
    queryJob.dependencyRevisionsList.forEach(revision => {
      const dependencyDataset = datasets.find(dataset => dataset.id === revision.datasetId)
      if (isDuckDBDataset(dependencyDataset, queries)) visit(jobById.get(revision.queryJobId))
    })
    const dataset = datasetByQueryId.get(queryJob.queryId)
    if (!dataset) return
    ordered.push({
      dataset,
      queryJob,
      dependencyIds: queryJob.dependencyRevisionsList.map(revision => revision.datasetId),
      duckDBDependencyIds: queryJob.dependencyRevisionsList
        .filter(revision => isDuckDBDataset(datasets.find(dataset => dataset.id === revision.datasetId), queries))
        .map(revision => revision.datasetId),
      publish
    })
  }

  roots.forEach(job => visit(job, true))
  return ordered
}
