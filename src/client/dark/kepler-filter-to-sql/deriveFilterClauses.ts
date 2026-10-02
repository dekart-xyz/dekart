import { filterField, filterSqlCondition } from './filterSqlCondition'
import type { Filter, SqlCondition } from './filterSqlCondition'

/** Clause for one binding key. A null SQL condition represents an inactive constraint. */
export interface FilterClause {
  filterId: string
  field: string | null
  sqlCondition: SqlCondition | null
}
/**
 * Derive clauses for filters whose `Filter.dataId` contains the supplied dataId. activeFilterIds supplies
 * SQL condition eligibility; inactive or disabled filters yield null SQL conditions.
 * The caller supplies the SQL condition for each eligible polygon filter.
 * Missing scalar fields, unsupported scalar types and invalid value shapes throw. Inputs are unchanged.
 * Scalar identifiers and values are escaped by mosaic-sql; the polygon callback owns its SQL escaping.
 *
 * @example
 * ```ts
 * import { deriveFilterClauses } from './index'
 *
 * const filter = {
 *   id: 'selection', type: 'select', dataId: ['a'],
 *   name: ['author'], value: "O'Brien\\<script>"
 * }
 * const [clause] = deriveFilterClauses([filter], 'a', new Set(['selection']), () => null)
 * String(clause.sqlCondition) // ("author" IN ('O''Brien\\<script>'))
 * ```
 */
export function deriveFilterClauses (
  filters: Filter[], dataId: string, activeFilterIds: ReadonlySet<string>,
  polygonSqlCondition: (filter: Filter) => SqlCondition | null
): FilterClause[] {
  return filters.filter(filter => filter.dataId.includes(dataId)).map(filter => ({
    filterId: filter.id,
    field: filterField(filter, dataId),
    sqlCondition: filter.enabled !== false && activeFilterIds.has(filter.id)
      ? filter.type === 'polygon' ? polygonSqlCondition(filter) : filterSqlCondition(filter, dataId)
      : null
  }))
}
