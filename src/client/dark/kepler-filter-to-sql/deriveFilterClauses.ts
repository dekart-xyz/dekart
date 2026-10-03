import { filterField, filterSqlCondition } from './filterSqlCondition'
import type { Filter, SqlCondition } from './filterSqlCondition'
import { polygonFilterSqlCondition } from './polygonFilterSqlCondition'
import type { LayerBinding, PolygonFilter } from './polygonFilterSqlCondition'

/** Clause for one binding key. A null SQL condition represents an inactive constraint. */
export interface FilterClause {
  filterId: string
  field: string | null
  sqlCondition: SqlCondition | null
}
/**
 * Derive clauses for filters whose `Filter.dataId` contains the supplied dataId. activeFilterIds supplies
 * SQL condition eligibility; inactive or disabled filters yield null SQL conditions.
 * Spatial layers and column types supply polygon SQL conditions. Missing scalar fields, unsupported
 * scalar types and invalid value shapes throw. Point/icon and numeric endpoint layers use
 * finite coordinates; H3 uses valid cell centers; GeoArrow needs fixed-size float arrays;
 * text GeoJSON/WKT uses geometry-bound centers; native GEOMETRY/BLOB yields false.
 * Unsupported or unbound layers contribute no condition. Column types are needed only for
 * GeoArrow, text geometry, and H3 string conversions. Inputs are unchanged. Mosaic SQL
 * builders escape scalar and spatial identifiers and values; no SQL is executed.
 *
 * @example
 * ```ts
 * import { deriveFilterClauses } from './index'
 *
 * const filter = {
 *   id: 'selection', type: 'select', dataId: ['a'],
 *   name: ['author'], value: "O'Brien\\<script>"
 * }
 * const [clause] = deriveFilterClauses([filter], 'a', new Set(['selection']), { layers: [], columnTypes: {} })
 * String(clause.sqlCondition) // ("author" IN ('O''Brien\\<script>'))
 *
 * const area = { id: 'area', type: 'polygon', dataId: ['a'], name: [],
 *   layerId: ['points'], value: { geometry: { type: 'Polygon',
 *     coordinates: [[[0, 0], [1, 0], [0, 1], [0, 0]]] } } }
 * const layers = [{ id: 'points', type: 'point', config: { dataId: 'a', columnMode: 'points',
 *   columns: { lng: { value: 'odd"longitude' }, lat: { value: 'latitude' } } } }]
 * const [spatial] = deriveFilterClauses([area], 'a', new Set(['area']), { layers, columnTypes: {} })
 * String(spatial.sqlCondition) // Identifier is escaped as "odd""longitude"
 * ```
 */
export function deriveFilterClauses (
  filters: Filter[], dataId: string, activeFilterIds: ReadonlySet<string>,
  spatial: { layers: readonly LayerBinding[], columnTypes: Readonly<Record<string, string>> }
): FilterClause[] {
  return filters.filter(filter => filter.dataId.includes(dataId)).map(filter => ({
    filterId: filter.id,
    field: filterField(filter, dataId),
    sqlCondition: filter.enabled !== false && activeFilterIds.has(filter.id)
      ? filter.type === 'polygon' ? polygonFilterSqlCondition(filter as PolygonFilter, dataId, spatial.layers, spatial.columnTypes) : filterSqlCondition(filter, dataId)
      : null
  }))
}
