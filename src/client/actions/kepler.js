export function keplerDatasetStartUpdating () {
  return { type: keplerDatasetStartUpdating.name }
}

export function keplerDatasetFinishUpdating () {
  return { type: keplerDatasetFinishUpdating.name }
}

export function consumeAutoCreateLayer (datasetId) {
  return { type: consumeAutoCreateLayer.name, datasetId }
}
