export function widgetsChanged (config) {
  return { type: widgetsChanged.name, config }
}

export function widgetsDefaultsConsumed (datasetId) {
  return { type: widgetsDefaultsConsumed.name, datasetId }
}
