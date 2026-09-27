import { column, isBetween, isIn, literal } from '@uwdata/mosaic-sql'
import { polygonFilterClause } from './polygonFilterClause'

// Polygon names do not identify dataset fields; scalar names do.
export function nativeFilterField (filter, datasetId) {
  if (filter.type === 'polygon') return null
  return filter.name[filter.dataId.indexOf(datasetId)] || null
}

// Convert one Kepler filter into the equivalent Mosaic SQL predicate.
// example: district IN ('Berlin')
export function nativeFilterPredicate (filter, datasetId, layers, columnTypes) {
  // Disabled filters remain persisted in Kepler but do not constrain charts.
  if (filter.enabled === false) return null

  // Polygon filters bind layers instead of fields and constrain every chart on their dataset.
  if (filter.type === 'polygon') return polygonFilterClause(filter, datasetId, layers, columnTypes)

  const field = nativeFilterField(filter, datasetId)
  if (!field) throw new Error('Map filter has no field for this dataset.')

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
