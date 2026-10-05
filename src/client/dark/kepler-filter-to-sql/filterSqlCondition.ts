import { column, isBetween, isIn, literal } from '@uwdata/mosaic-sql'
import type { ExprNode } from '@uwdata/mosaic-sql'

/**
 * Library-owned filter projection. Scalar values use Kepler's raw field units.
 * Polygon values contain GeoJSON `geometry` and may contain `properties.shape`
 * `Rectangle` with a four-number `properties.bbox`; `layerId` names the bound layers.
 * Invalid polygon geometry may throw during SQL derivation.
 */
export interface Filter {
  /** Stable identity carried into the derived FilterClause. */
  id: string
  /** Kepler filter kind, such as select, multiSelect, range, or polygon. */
  type: string
  /** Data binding IDs; each position corresponds to the same position in name. */
  dataId: string[]
  /** Filter field names paired with dataId entries. */
  name: string[]
  /** Scalar value or polygon geometry in the shape required by type. */
  value: unknown
  /** Layer IDs used to derive a polygon filter's spatial condition. */
  layerId?: string[]
  /** False disables this filter's SQL condition. */
  enabled?: boolean
}
/** Mosaic SQL expression; identifiers and literals are escaped by mosaic-sql. */
export type SqlCondition = ExprNode

/**
 * Resolve the field at the matching dataId position. Polygons and absent bindings return null.
 * Does not mutate inputs or emit SQL.
 */
export function filterField (filter: Filter, dataId: string): string | null {
  if (filter.type === 'polygon') return null
  const field = filter.name[filter.dataId.indexOf(dataId)]
  return field === undefined || field === '' ? null : field
}

/**
 * Translate enabled scalar filters to inclusive SQL conditions; disabled filters return null.
 * Missing fields, unsupported types and invalid shapes throw. Polygon SQL conditions come from
 * callers. Identifiers and values are escaped by mosaic-sql, never interpolated as SQL.
 * Inputs are unchanged.

 */
export function filterSqlCondition (filter: Filter, dataId: string): SqlCondition | null {
  if (filter.enabled === false) return null
  const field = filterField(filter, dataId)
  if (field === null) throw new Error('Filter has no field for this dataId.')
  switch (filter.type) {
    case 'select': return isIn(column(field), [literal(filter.value)])
    case 'multiSelect':
      if (!Array.isArray(filter.value)) throw new Error('Category filter needs an array.')
      return filter.value.length > 0 ? isIn(column(field), filter.value.map(literal)) : literal(false)
    case 'range':
      if (!Array.isArray(filter.value) || filter.value.length !== 2) throw new Error('Range filter needs two bounds.')
      return isBetween(column(field), filter.value)
    default: throw new Error(`Filter type ${filter.type} is not supported.`)
  }
}
