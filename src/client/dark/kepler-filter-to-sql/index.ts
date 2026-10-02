/**
 * **Kepler.gl filter records → SQL conditions.**
 *
 * Scalar SQL conditions use `@uwdata/mosaic-sql` expression objects and can be rendered
 * as DuckDB SQL. Spatial SQL conditions are supplied by the caller.
 *
 *
 * @packageDocumentation
 */
export type { Filter, SqlCondition } from './filterSqlCondition'
export { deriveFilterClauses } from './deriveFilterClauses'
export type { FilterClause } from './deriveFilterClauses'
