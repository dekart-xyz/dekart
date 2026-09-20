import { column, isBetween, isIn, literal } from '@uwdata/mosaic-sql'

// Convert one scalar Kepler filter into the equivalent Mosaic SQL predicate.
export function nativeFilterPredicate (filter, datasetId) {
  // Disabled filters remain persisted in Kepler but do not constrain charts.
  if (filter.enabled === false) return null

  const datasetIndex = filter.dataId.indexOf(datasetId)
  const field = filter.name[datasetIndex]
  if (datasetIndex < 0 || !field) throw new Error('Map filter has no field for this dataset.')

  switch (filter.type) {
    case 'select':
      return isIn(column(field), [literal(filter.value)])
    case 'multiSelect':
      return filter.value.length ? isIn(column(field), filter.value.map(literal)) : literal(false)
    case 'range':
      return isBetween(column(field), filter.value)
    default:
      throw new Error(`Map filter type ${filter.type} is not available for charts.`)
  }
}
