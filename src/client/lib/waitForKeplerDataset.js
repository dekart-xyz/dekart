// waitForKeplerDataset resolves after Kepler publishes the expected immutable dataset revision.
export default async function waitForKeplerDataset (getState, datasetId, previousDataset, totalRows, isCurrent) {
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    if (!isCurrent()) {
      return false
    }
    const current = getState().keplerGl.kepler?.visState.datasets?.[datasetId]
    if (current && current !== previousDataset &&
      current.fields.length > 0 && current.dataContainer.numRows() === totalRows) {
      return true
    }
    await new Promise(resolve => window.setTimeout(resolve, 25))
  }
  throw new Error('Kepler failed to publish the dataset.')
}
