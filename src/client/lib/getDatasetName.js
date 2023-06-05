export default function getDatasetName (dataset, queries, files) {
  if (dataset.name) {
    return dataset.name
  }
  if (dataset.queryId) {
    const i = queries.findIndex(q => q.id === dataset.queryId)
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
