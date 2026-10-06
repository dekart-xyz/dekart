# Polygon filter SQL in `kepler-filter-to-sql`

## Goal

Move the pure SQL translation in `src/client/lib/polygonFilterClause.js` into the existing `src/client/dark/kepler-filter-to-sql/` library. Preserve spatial behavior and expose one clause-derivation function. This is an ownership move, not a rewrite of `useWidgetFilters` or its Kepler/Mosaic synchronization.

## Public interface

Add `polygonFilterSqlCondition.ts` as an internal module. Re-export only its layer input types from `index.ts`; `deriveFilterClauses` is the sole public function:

```ts
export interface ColumnBinding {
  value?: string | null
  fieldIdx?: number
}

export interface LayerBinding {
  id: string
  type: string
  config: {
    dataId: string
    columnMode?: string
    columns: Record<string, ColumnBinding | undefined>
  }
}

export function deriveFilterClauses(
  filters: Filter[],
  dataId: string,
  activeFilterIds: ReadonlySet<string>,
  spatial: {
    layers: readonly LayerBinding[]
    columnTypes: Readonly<Record<string, string>>
  }
): FilterClause[]
```

`Filter` gains optional `layerId` for polygon records. `dataId` selects filters and layers; only IDs in a polygon filter's `layerId` whose layer `config.dataId` matches it contribute. `columnTypes` contains type names for bound columns, such as `VARCHAR` or `DOUBLE[2]`; missing types suppress type-dependent GeoArrow and text geometry clauses, while coordinate and H3 numeric clauses still work. Each result contains a Mosaic SQL expression, or `null` when inactive or unsupported. Matching spatial layers are ANDed. The function does not mutate inputs or execute SQL. Invalid geometry input may throw, matching the current call site's error handling.

`deriveFilterClauses` calls the internal polygon translator only for active, enabled polygon filters. Scalar filters ignore the spatial inputs.

The caller in `useWidgetFilters.js` becomes:

```js
import { deriveFilterClauses } from '../dark/kepler-filter-to-sql/index'

const clauses = deriveFilterClauses(
  filters,
  datasetId,
  new Set(record.map(filter => filter.id)),
  { layers, columnTypes }
)
```

This removes the `../lib/polygonFilterClause` import and callback, but does not materially reduce the hook's line count. `getFilterRecord`, Kepler state selection, SQLRooms selection updates, scheduling, and dispatch remain in app code.

## Behavior to preserve

| Input | Current result |
| --- | --- |
| Point/icon coordinates | Finite longitude and latitude, plus bound altitude, inside polygon |
| Arc/line | Both endpoints inside; H3 string endpoints use valid cell centers |
| H3 cell | Valid cell center inside; `VARCHAR` also accepts decimal string IDs |
| GeoArrow point/line | Supported fixed-size float arrays only |
| Text GeoJSON/WKT | Bounding-box center inside; rectangle bounds inclusive |
| `GEOMETRY`/`BLOB` GeoJSON layer | `FALSE` |
| Unsupported, deleted, or other-binding layers | No contribution; `null` if none remain |

Continue building identifiers with `column()` and values with `literal()` or Mosaic SQL templates. Document the escaping contract and a hostile column-name/value example in the generated README. Keep the existing SQL expressions and DuckDB spatial function calls unchanged during the move.

## Implementation and verification

1. Move the function and private helpers to `polygonFilterSqlCondition.ts`. Define only the structural inputs they read; import no app files or generated proto types. Keep the function internal to the library.
2. Move the existing `polygonFilterClause.test.js` cases to public API tests importing `deriveFilterClauses` from `./index`; retain the supported-layer and hostile-input cases.
3. Update `useWidgetFilters.js` to pass spatial inputs to `deriveFilterClauses`, then remove the old implementation and test. Regenerate the library README from source comments and examples.
4. Run the dark-library type, isolation, documentation, and contract checks. Run the relevant existing widget polygon Cypress scenario to verify the reviewed glue and rendered chart behavior.

## Dark API changes

- Keep `deriveFilterClauses` as the sole public function, replacing its fourth callback argument with spatial inputs.
- Add `LayerBinding` and `ColumnBinding` types and optional `Filter.layerId`.
- Remove the app-private `polygonFilterClause` module after its sole caller switches.
