export function shouldUpdateDataset (dataset, prevDatasetsList) {
  const prevDataset = prevDatasetsList.find(d => d.id === dataset.id)
  if (prevDataset) {
    if (prevDataset.name !== dataset.name) {
      return true
    }
  }
  return false
}
