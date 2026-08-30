export default function getDatasetName (dataset, datasets, files) {
  if (dataset.name) {
    return dataset.name
  }
  if (dataset.queryId) {
    const queryIds = [...new Set(datasets.map(dataset => dataset.queryId).filter(Boolean))]
    const i = queryIds.indexOf(dataset.queryId)
    return `Query ${i + 1}`
  }
  if (dataset.fileId) {
    const file = files.find(f => f.id === dataset.fileId)
    if (file && file.name) {
      return file.name
    }
  }
  return 'New'
}
