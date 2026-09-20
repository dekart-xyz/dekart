// Capture only inputs read by Kepler's CPU predicates, before mutable layers change.
export function nativeFilterInputs (table, filters, layers) {
  const inputs = [table.dataContainer, table.dataContainer.numRows()]
  for (const filter of filters) {
    const index = filter.fieldIdx[filter.dataId.indexOf(table.id)]
    const field = table.fields[index]
    inputs.push(filter.id, filter.type, filter.enabled, index, filter.value, field?.valueAccessor, field?.format, field?.filterProps?.mappedValue)
    // Spatial predicates depend on geometry bindings, not color, opacity or visibility.
    if (filter.type === 'polygon') {
      for (const id of filter.layerId || []) {
        const layer = layers.find(layer => layer.id === id && layer.config.dataId === table.id)
        inputs.push(id, layer?.type, layer?.config.dataId, layer?.config.columns, layer?.config.columnMode, layer?.centroids, layer?.dataToFeature?.centroids)
      }
    }
  }
  return inputs
}
