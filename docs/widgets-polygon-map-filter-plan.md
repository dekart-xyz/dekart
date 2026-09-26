# Widgets: Respect Kepler Polygon Map Filters

## Context

Report widgets (Mosaic charts over DuckDB-Wasm) mirror Kepler map filters so charts count the same rows the map shows. A Kepler polygon filter (drawn with Draw → Polygon/Rectangle, then "Filter Layers") is not a field filter, so today every widget on that dataset shows `Could not apply map filters: …` instead of a chart. Users lose all charts for a common map interaction, and the filter strip may say `No filters` while data is filtered.

## Current State

- `src/client/lib/nativeFilterPredicate.js:8-10` resolves `filter.name[datasetIndex]` as a field. Polygon filters have no field. Kepler's `generatePolygonFilter(layers, feature)` can put layer labels in `name`, but its UI `setPolygonFilterLayer` path starts with an empty layer list, so `name` stays empty even for a labelled layer. The predicate throws `Map filter has no field for this dataset.` in that path.
- `src/client/widgets/useWidgetFilters.js:53-60` treats `filter.name[datasetIndex]` as a field for interactor lookup and builds one Mosaic clause per non-widget Kepler filter; `getFilterRecord` includes the polygon filter, so the predicate throw sets the error for the whole dataset.
- `src/client/lib/nativeFilterInputs.js:9-14` already tracks polygon layer bindings for cache invalidation.
- `src/client/widgets/FilterStrip.jsx:7-12,30` labels chips from `filter.name` and shows `JSON.stringify(filter.value)` as tooltip; polygon filters appear under the layer label or not at all.
- Charts query `widgets.d_<dataset>`, a `SELECT *` view over the DuckDB physical table (`src/client/widgets/useWidgetSources.js:48`). Geometry there keeps its DuckDB type (`GEOMETRY`, `VARCHAR` GeoJSON/WKT, `BLOB` WKB); Kepler sees a WKB-cast copy (`src/client/lib/duckdb/table.js:116-138`).
- DuckDB `spatial` and `h3` extensions are loaded for chart connections (`src/client/lib/duckdb/database.js:118-128`, `src/client/lib/duckdb/runtime.js:56-58`).
- Polygon filters persist in the report map config like any Kepler filter.
- Failing regression: `cypress/e2e/cloud/widgetsPolygonMapFilter.cy.js` (unlabelled point layer, rectangle, expects no widget error).

### Kepler 3.2.6 polygon semantics (source of truth)

`getPolygonFilterFunctor` (`@kepler.gl/utils/dist/filter-utils.js:356`) builds one predicate per layer in `filter.layerId` whose `config.dataId` is the dataset; a row passes when all pass. Filtered rows belong to the dataset, so every layer and every chart on it sees the same result. Kepler's point test is turf `booleanWithin`.

| Layer type | Kepler row test | Chart SQL (`P` = polygon, `G` = parsed geometry) |
| --- | --- | --- |
| `point`, `icon` (lat/lng mode) | `[lng, lat, altitude?]` all finite, `[lng, lat]` within | `isfinite` on `lng`, `lat` (and bound altitude), then `ST_Within(ST_Point(lng, lat), P)` |
| `point` (geojson mode) | Kepler's point accessor returns raw field values; text geometry is not parsed here | no clause until a real dataset establishes map/chart parity |
| `point` (geoarrow mode) | Kepler reads the first two values from an Arrow FixedSizeList point | finite x/y from a `FLOAT[n]` or `DOUBLE[n]` widget column with n >= 2, then `ST_Within(ST_Point(x, y), P)` |
| `arc`, `line` | both endpoints finite and within | same `isfinite` + point clause for `(lng0, lat0)` and `(lng1, lat1)` |
| `hexagonId` | valid H3 id and centroid within; decimal string IDs are converted by Kepler for non-H3 fields | valid hex string or integer centroid, with a `TRY_CAST(id AS UBIGINT)` fallback for decimal strings |
| `geojson`, text column (GeoJSON/WKT) | `@turf/center` (bbox center) within; `properties.shape === 'Rectangle'` uses inclusive bbox test on that center | center `ST_Point((ST_XMin(G)+ST_XMax(G))/2, (ST_YMin(G)+ST_YMax(G))/2)`, then `ST_Within(center, P)` or inclusive `BETWEEN` on the rectangle bbox |
| `geojson`, DuckDB `GEOMETRY`/WKB column | Kepler computes no centroids for WKB, so every row fails (map hides all features) | `literal(false)` (Resolved Decision (a)) |
| `geojson`, native GeoArrow column (e.g. `geoarrow.polygon`) | loaders.gl mean-vertex center within | out of scope; no clause until a dataset needs it |
| other types | always true | no clause |

- `P` = `ST_GeomFromGeoJSON(literal(JSON.stringify(filter.value.geometry)))` via `@uwdata/mosaic-sql` `literal`.
- Every layer column (`lng`, `lat`, `id`, geometry) is referenced with `@uwdata/mosaic-sql` `column(name)`, never interpolated (eng review D4).
- `G` is parsed from the widget view's DuckDB column type, always inside `TRY(...)` so an unparseable value fails only its row (Kepler skips it) instead of the whole chart query:
  - `GEOMETRY`: as is.
  - `BLOB`: `ST_GeomFromWKB`.
  - `VARCHAR` or `JSON`: text starting with `{` is GeoJSON, anything else is WKT (`ST_GeomFromText`). GeoJSON Features (accepted by `table.js:40-42`) must be unwrapped to `$.geometry` first; DuckDB `ST_GeomFromGeoJSON` returns NULL for a Feature (verified with DuckDB CLI + spatial).

## Resolved Decision: Native `GEOMETRY` datasets

Kepler's WKB path (`@kepler.gl/layers/dist/layer-utils.js:60-127`) returns no centroids and `GeoJsonLayer.isInPolygon` returns false without them (`geojson-layer.js:440`), so a polygon filter hides every feature on the map. **Decision (eng review D1): option (a).** Charts match the map: a `geojson` layer bound to a `GEOMETRY` or `BLOB` (WKB) column contributes `literal(false)`, so charts show 0 rows. No Kepler patch. Mark the branch in code with `gstack-shortcut(dec-f4dbe00b): charts copy Kepler's empty WKB polygon result, upgrade when users report empty map/charts on GEOMETRY datasets or Kepler moves past 3.2.6` (then patch Kepler WKB centroids with `@turf/center` and switch charts to the bbox-center rule). Rejected: (b) bbox-center in charts only (breaks parity), (c) Kepler patch first (deferred as the upgrade path).

## Proposed Change

Kepler filters are the single source of truth; data flows one way from Kepler into widgets. A polygon filter becomes one Mosaic clause on its dataset's chart selection, built from the semantics table. It is identified by `filter.type === 'polygon'`, never by its `name`, so no chart treats a layer label as a field and every chart on the dataset is filtered. Geometry filters are created, edited and removed only through Kepler UI.

The filter strip lists each polygon filter as a chip labelled `Map area`, tooltip `Map area · <layer labels>`. The chip opens the existing Kepler filter editor; its remove button removes the Kepler filter, which clears the chart clause through the same one-way sync.

### Implementation Plan

1. Add a stateless polygon clause builder `polygonFilterClause.js` next to `nativeFilterPredicate` (header comment: ASCII dispatch tree with Kepler 3.2.6 source refs, eng review D6) that takes the filter, dataset id, Kepler layers and widget-view column types, and returns the AND of per-layer clauses from the semantics table, or `null` when no bound layer applies.
2. Route `filter.type === 'polygon'` to that builder in `nativeFilterPredicate` before field resolution; keep the existing errors for scalar filters.
3. Export `nativeFilterField(filter, datasetId)` from `nativeFilterPredicate.js` (returns `null` for polygon filters or a missing field) and use it in both the predicate and `useWidgetFilters`, so polygon filters skip field/interactor lookup in one place (eng review D5). Pass layers and column types into the predicate.
4. Take widget-view column types from SQLRooms `state.db.tables` (already refreshed on view swap in `useWidgetSources.js:56`, read in `WidgetContents.jsx:265,272`; shape `{name, type}[]`) via `useStore`, and add them to the `nativeFilterInputs` cache inputs and the effect dependencies so a reload that changes a column type rebuilds the clause. No special guard when a type is missing: the builder's column-type switch ends in a default branch that emits no clause for an unknown or missing type (eng review D9, per `AGENTS.md:10-11`). Cache inputs hold only the bound columns' type strings, so unrelated schema refreshes do not rebuild clauses (eng review D8).
5. Update `FilterStrip` to label polygon filters `Map area` and build the layer-label tooltip from bound Kepler layers, since UI-created filters have an empty `name` array.
6. Emit `literal(false)` for `geojson` layers on `GEOMETRY`/`BLOB` columns (Resolved Decision (a)), with the `gstack-shortcut` marker.
7. Add unit tests for the builder and extend `widgetsPolygonMapFilter.cy.js` (see Testing Plan). Deliver in the three slices below.

## Delivery Slices

Three vertical slices, each shippable and proven on its own. A slice only adds cases to the builder's layer-type switch; it never changes code an earlier slice built, so earlier tests keep passing unchanged and are re-run only as regression. The builder's header diagram (D6) grows by one branch group per slice.

```
Slice 1  point/icon lat/lng ──► fixes the reported bug end to end (routing, builder, chip)
Slice 2  + arc/line, hexagonId ──► builder switch cases only
Slice 3  + geometry columns ──► column types wired in; geojson text, geo-mode point, GEOMETRY/BLOB
```

### Slice 1: point layers end to end
- **Scope:** `nativeFilterField` helper and polygon routing in `nativeFilterPredicate` (D5); `polygonFilterClause.js` with the point/icon lat/lng case (`isfinite` + `ST_Within(ST_Point(lng, lat), P)`, altitude when bound), multi-layer AND, layer `dataId` match, and a default "no clause" case for every other layer type; `column()` for every column (D4); `Map area` chip and tooltip in `FilterStrip`.
- **Not in this slice:** column types. Lat/lng columns are plain numbers, so `useWidgetFilters` and `nativeFilterInputs` get no new inputs.
- **Cypress (`widgetsPolygonMapFilter.cy.js`):** two 3-row clusters ~10 degrees apart (D7), rectangle over one gives Number `3` and matching category counts, no `Could not apply map filters`, `Map area` chip replaces the `No filters` assertion, remove gives `6`, reload keeps `3`; labelled-layer variant.
- **Unit:** point with and without altitude, multi-layer AND, deleted layer id, disabled polygon (D8), two-dataset filter (D8), `column()` quoting (D4), `nativeFilterField`, scalar regression contract.
- **Done when:** acceptance criteria 1, 3, 4, 5 and 7 hold for point layers.

### Slice 2: arc, line and H3
- **Scope:** new builder cases only. `arc`/`line` apply the slice 1 point clause to `(lng0, lat0)` and `(lng1, lat1)`, including bound line altitudes; `hexagonId` uses `CASE WHEN h3_is_valid_cell(id) THEN ST_Within(ST_Point(h3_cell_to_lng(id), h3_cell_to_lat(id)), P) ELSE false END`. Routing, hook and chip untouched; still no column types.
- **Cypress:** H3 query (`h3_latlng_to_cell_string(...) AS h3`, auto-created `hexagonId` layer) counts follow cell centroids.
- **Unit:** arc/line both endpoints in, one endpoint out; valid and invalid H3 ids.
- **Done when:** acceptance criterion 2 holds for H3; slice 1 specs still pass.

### Slice 3: geometry-column layers
- **Scope:** read widget-view column types from `state.db.tables` in `useWidgetFilters`, pass them into the builder as a new `columnTypes` argument, and cache only the bound columns' type strings in `nativeFilterInputs` (D8); `geojson` on text columns (bbox center, inclusive bbox for `Rectangle`, Feature unwrapped to `$.geometry`, WKT via `ST_GeomFromText`, all inside `TRY`); H3 string coordinates in arc/line endpoints and decimal string IDs in `hexagonId`; GeoArrow point coordinates on fixed-size float arrays with at least two values; `GEOMETRY`/`BLOB` geojson returns `literal(false)` with the `gstack-shortcut(dec-f4dbe00b)` marker (D1); unknown or missing type falls to the default case (D9). Point geojson mode stays without a clause because Kepler 3.2.6's point accessor returns raw field values rather than a parsed geometry.
- **Interface change:** only the added `columnTypes` argument. Slice 1 and 2 cases never read it, so their tests are unchanged.
- **Cypress:** text GeoJSON dataset with the asymmetric polygon (charts follow bbox center); `GEOMETRY` dataset gives Number `0`, no error.
- **Unit:** each column type, Feature vs bare geometry vs WKT, rectangle bbox branch, unknown type returns no clause, `nativeFilterInputs` invalidates on a bound column-type change and not on unrelated tables.
- **Done when:** acceptance criteria 2 (text GeoJSON) and 6 hold; slice 1 and 2 specs still pass.

## Acceptance Criteria

1. Filtering a point layer with a drawn rectangle updates the Number widget to the rows inside and category counts to match; no `Could not apply map filters` error appears, whether or not the layer has a label.
2. Same for an H3 dataset and a text GeoJSON/WKT polygon dataset, where one polygon's bbox center and vertex mean fall on opposite sides of the drawn shape and charts follow the bbox center.
3. A polygon filter bound to two layers of one dataset keeps only rows passing both layer tests.
4. The filter strip shows a `Map area` chip for each polygon filter; removing it restores unfiltered counts.
5. After reload, the saved polygon filter still filters charts.
6. On a native `GEOMETRY` dataset, a polygon filter shows 0 rows in charts, matching the empty map.
7. Existing widget specs (`cypress/e2e/cloud/widgets*.cy.js`, `keplerFilterReload.cy.js`) pass.

## Testing Plan

| Layer | What | Count |
| --- | --- | --- |
| Unit (vitest) | Builder output per layer type: point with and without altitude, point geojson mode's no-clause fallback, arc/line including H3 endpoints, H3, text GeoJSON (bare geometry, Feature, WKT) center and rectangle bbox, multi-layer AND, deleted layer id | +1 file |
| Unit (vitest, stateless functions only per `AGENTS.md:18`) | Builder: `GEOMETRY`/`BLOB` -> `literal(false)` (D1), unknown/missing type -> no clause (D9), `column()` quoting with `my lat"x` (D4), disabled polygon -> null, two-dataset filter keeps only own layer (D8). `nativeFilterPredicate.test.js`: `nativeFilterField` (D5) and regression contract (scalar SQL unchanged beside a polygon). `nativeFilterInputs.test.js`: invalidates on bound column-type change, not on unrelated tables (D8) | +cases in 2 existing files |
| E2E (cloud, extend existing spec) | Two point clusters (3 + 3 rows) ~10 degrees apart on a diagonal so auto-fit puts them in opposite corners (eng review D7), UI-drawn rectangle over one corner: Number `3`, category counts, `Map area` chip (replaces the current `No filters` assertion), remove → `6`, reload keeps `3`; labelled-layer variant | +2 cases |
| E2E (cloud) | H3 query (`h3_latlng_to_cell_string(...) AS h3` so Kepler auto-creates a `hexagonId` layer) and text GeoJSON query with the asymmetric polygon | +2 cases |
| E2E (cloud) | `GEOMETRY` dataset: polygon filter gives Number `0`, no error | +1 case |
| Regression | Existing widget and Kepler filter specs | 0 new |

## Risks

- **Performance:** per-row `ST_Within` on 1M-row datasets. Accepted for now; no bbox pre-filter.
- **Boundary points:** DuckDB `ST_Within` and turf `booleanWithin` may disagree for points exactly on the polygon edge.
- **Null geometries (text GeoJSON):** Kepler pushes centroids only for non-null features, so rows after a null geometry use shifted centroids on the map. Charts use each row's own geometry; exact parity is not possible there.
- **Stale layer ids:** a polygon filter can reference a deleted layer; Kepler applies no test for it and charts do the same.

## Rollback Plan

Revert the change; charts return to the current error for polygon filters. No persisted data or API changes.

## Files Reference

| File | Change |
| --- | --- |
| `src/client/lib/nativeFilterPredicate.js` | Route polygon filters to the builder |
| `src/client/lib/polygonFilterClause.js` + `polygonFilterClause.test.js` (new) | Polygon clause per layer type (eng review D2: separate module) |
| `src/client/widgets/useWidgetFilters.js:53-64,87` | Polygon skips field lookup; pass layers and column types; column types in cache inputs and deps |
| `src/client/lib/nativeFilterInputs.js` | Include widget-view column types |
| `src/client/widgets/FilterStrip.jsx:7-12,30` | `Map area` chip and tooltip |
| `cypress/e2e/cloud/widgetsPolygonMapFilter.cy.js` | Point, labelled layer, H3, GeoJSON, GEOMETRY cases |

## Out of Scope

- Geometry filter controls inside widgets.
- Bbox or index pre-filtering for performance.
- Refactoring existing widget chart interactions (click, brush) into strict Kepler-first one-way dispatch; today they update the Mosaic selection and then sync to Kepler. Track separately.
- Kepler layer types without a polygon test (Kepler treats them as unfiltered).

## Decision ledger

### Scope record (Step 0 complexity gate)
feature answers: D1 = "Charts show 0 rows (a)" (GEOMETRY handled by `literal(false)`, no Kepler patch; decision dec-f4dbe00b); structure: A "Original arrangement" (D2); accepted scope: plan steps 1-7 with a new `polygonFilterClause.js` + test, edits to `nativeFilterPredicate.js`, `useWidgetFilters.js`, `nativeFilterInputs.js`, `FilterStrip.jsx`, extended `widgetsPolygonMapFilter.cy.js`, no Kepler patch; pending remedies: none at gate time.

### R1: Behavior when a bound layer's column type is missing
Finding: A1, P2, confidence 8/10, `src/client/widgets/useWidgetFilters.js:53-60` + plan step 4 (Implementation Plan), reviewer: eng review (Claude)
Plan baseline: plan step 4 takes widget-view column types from `state.db.tables`; behavior when the dataset's view or the bound column is absent from that list is unspecified.
Runtime evidence: `useWidgetSources.js:119` refreshes schemas before `setReadySources` at `:124`, so types exist on first load; a thrown error inside the `.map` at `useWidgetFilters.js:53` reaches `:86` and drops every clause for the dataset. Behavior with a missing type: unknown (future code).
Comparison grid:
| Choice | Current | A | B | C |
|---|---|---|---|---|
| R1 missing type | unspecified, pending | skip this update: no cache write, no error, effect reruns when types arrive | layer contributes no clause (charts unfiltered for it) | throw, dataset shows `Could not apply map filters` |
| D1 GEOMETRY | approved (a), D1 | literal(false) | literal(false) | literal(false) |
Question D3:
D3 — What should charts do when the geometry column's type isn't known yet?
Project/branch/task: dekart widget-bug branch, polygon map filter plan, Section 1 Architecture.
ELI10: The polygon clause needs the DuckDB type of the geometry column (GEOMETRY, BLOB, VARCHAR) to know how to parse it. That type comes from SQLRooms' table list. If the list hasn't caught up (or the column vanished after a reload), the plan doesn't say what happens. Today any error in that code path wipes every map filter for the dataset and shows an error.
Stakes if we pick wrong: charts briefly show unfiltered counts, or a scary error that fixes itself a moment later, or they silently stay unfiltered.
Recommendation: A because it waits for real data instead of guessing, never shows a false error, and the planned cache/deps change already reruns the effect when types arrive.
Completeness: A=9/10, B=6/10, C=5/10
Header: Missing type
Options:
A) Wait for types (recommended)
Treat a missing view or column type as "not ready": return before caching and before any selection update, no error; column types are in the effect deps so it reruns when `state.db.tables` updates. Unit test: builder returns a `NOT_READY` marker (or hook skips) when types are missing. Human ~1h / CC ~5 min. Low maintenance.
B) No clause for that layer
The builder skips a layer whose column type is unknown, like Kepler skips unsupported layers; charts show unfiltered rows for it until types arrive. Human ~30min / CC ~3 min. Risk: silent mismatch if a column is permanently missing.
C) Throw an error
The builder throws, so the dataset shows `Could not apply map filters: …` until types arrive. Human ~15min / CC ~2 min. Risk: false alarm that users see on reload.

Reopened: D8 answer requires compliance with `../dekart/AGENTS.md`. `AGENTS.md:10-11` forbids speculative guards without a failing test; the D3 guard has no observed failure (types exist before `ready`, `useWidgetSources.js:119,124`) and its planned unit test targets a stateful hook, which `AGENTS.md:18` disallows.
Comparison grid (reopened):
| Choice | Current | A | B |
|---|---|---|---|
| R1 missing type | approved D3 guard, reopened | no guard: builder's type switch has a default branch that emits no clause for an unknown/missing type (like Kepler's "other types"); no special hook path | keep D3 guard, first write a failing Cypress test reproducing a missing type after reload |
| D1 GEOMETRY | approved (a) | literal(false) | literal(false) |
Question D9:
D9 — Drop the "wait for types" guard to comply with Dekart's no-speculative-guard rule?
Header: Missing type
Options:
A) Drop guard, default branch (recommended)
No hook guard. The builder's column-type switch falls through to "no clause" for an unknown or missing type, the same as Kepler's unsupported layers. Covered by the builder unit test for an unknown type. Human ~15min / CC ~2 min.
B) Keep guard with Cypress proof
Keep D3, but only after a failing Cypress test shows charts misbehave when types lag a reload. Human ~half day / CC ~30 min; may be impossible to reproduce.

State: approved
Actual answer: A) "Drop guard, default branch (recommended)", D9 answer 2026-09-23
Accepted scope: no hook guard for missing types. The builder's column-type switch ends in a default branch that emits no clause for an unknown or missing type; covered by a builder unit test for an unknown type.
History: D3 answered A) "Wait for types (recommended)" 2026-09-23; accepted scope was: missing view or bound column type = not ready, hook returns before caching/update with no error, unit test for missing-type path. Reopened after D8 for AGENTS.md compliance.

### R2: How layer column names enter chart SQL
Finding: CQ1, P2, confidence 8/10, plan semantics table (lines 22-31) + `src/client/lib/nativeFilterPredicate.js:1` (uses `column` from `@uwdata/mosaic-sql`), reviewer: eng review (Claude)
Plan baseline: the table writes `lng`, `lat`, `id`, `G` as bare names; how Kepler layer column names (`layer.config.columns.*.value`, user-chosen SQL aliases) become identifiers is unspecified.
Runtime evidence: scalar filters already use `column(field)` (`nativeFilterPredicate.js`); `literal` escapes quotes (`literal.js:20`). Column names with spaces or quotes are legal in DuckDB query results.
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R2 identifiers | unspecified, pending | always `column(name)`; unit test with a name containing a space and a double quote | left to implementer |
| R1 missing type | approved A (D3) | unchanged | unchanged |
Question D4:
D4 — Require mosaic-sql column() for every geometry/coordinate column?
Header: Column refs
Options:
A) Require column() + test (recommended)
Builder references every layer column via `column(name)`; unit test uses a column named `my lat"x` and asserts quoted SQL. Human ~30min / CC ~3 min. Matches nativeFilterPredicate.
B) Leave to implementer
No explicit rule or test. Human 0 / CC 0. Risk: a query alias with a space breaks every chart on that dataset.

State: approved
Actual answer: A) "Require column() + test (recommended)", D4 answer 2026-09-23
Accepted scope: builder references every layer column through `column(name)`; unit test with a column named `my lat"x` asserts quoted SQL.
History: none

### R3: One helper for "which field does this filter use on this dataset"
Finding: CQ2, P3, confidence 8/10, `src/client/widgets/useWidgetFilters.js:54-55` and `src/client/lib/nativeFilterPredicate.js:8-9`, reviewer: eng review (Claude)
Plan baseline: plan steps 2 and 3 each add a separate `filter.type === 'polygon'` check before resolving `filter.name[datasetIndex]` in both files.
Runtime evidence: both files already compute `filter.dataId.indexOf(datasetId)` then `filter.name[datasetIndex]` independently.
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R3 field lookup | duplicated in 2 files, pending | one exported `nativeFilterField(filter, datasetId)` in `nativeFilterPredicate.js`, returns `null` for polygon; both callers use it | two inline polygon checks as planned |
| R2 identifiers | approved A (D4) | unchanged | unchanged |
Question D5:
D5 — Share one field-lookup helper instead of two polygon checks?
Header: Field helper
Options:
A) Shared helper (recommended)
Export `nativeFilterField(filter, datasetId)` from nativeFilterPredicate.js (null for polygon or missing field); useWidgetFilters and the predicate both call it; unit tests in nativeFilterPredicate.test.js. Human ~30min / CC ~3 min.
B) Two inline checks
Keep the plan: add a polygon check in each file. Human ~15min / CC ~2 min. Risk: the next non-field filter type must be handled in two places again.

State: approved
Actual answer: A) "Shared helper (recommended)", D5 answer 2026-09-23
Accepted scope: export `nativeFilterField(filter, datasetId)` from `nativeFilterPredicate.js` (null for polygon or missing field); `useWidgetFilters` and the predicate both use it; unit tests in `nativeFilterPredicate.test.js`.
History: none

### R4: Inline ASCII diagram in the new builder
Finding: CQ3, P3, confidence 7/10, plan semantics table (lines 22-31) and new `src/client/lib/polygonFilterClause.js`, reviewer: eng review (Claude)
Plan baseline: the dispatch (layer type x column mode x DuckDB column type) is documented only in this plan doc.
Runtime evidence: not applicable (future file); this plan doc is not linked from code.
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R4 code diagram | none, pending | ASCII dispatch diagram as the header comment of polygonFilterClause.js, including the Kepler source line refs | no diagram; the plan doc is the reference |
Question D6:
D6 — Put the layer-type dispatch diagram in the builder's header comment?
Header: Code diagram
Options:
A) Add header diagram (recommended)
A ~15-line ASCII tree (layer type -> column mode/type -> SQL) with Kepler 3.2.6 source refs at the top of polygonFilterClause.js, updated with the code. Human ~20min / CC ~2 min.
B) No diagram
Plan doc stays the only reference. Human 0 / CC 0. Risk: the next Kepler upgrade reviewer has to rediscover the mapping.

State: approved
Actual answer: A) "Add header diagram (recommended)", D6 answer 2026-09-23
Accepted scope: ~15-line ASCII dispatch tree (layer type -> column mode/type -> SQL) with Kepler 3.2.6 source refs as the header comment of `polygonFilterClause.js`, maintained with the code.
History: none

### Regression contract (authorized by the review's iron rule, no question)
Existing scalar filter behavior is preserved: `nativeFilterPredicate.test.js:14,20` pass unchanged; new unit case asserts a range filter plus a polygon filter on one dataset each produce a clause and the scalar SQL is byte-identical to today's.

### R5: Deterministic E2E counts
Finding: T1, P2, confidence 7/10, `cypress/e2e/cloud/widgetsPolygonMapFilter.cy.js:28-38` (rectangle drawn at `width * 0.45 .. 0.75`, `height * 0.55 .. 0.95` of the overlay), reviewer: eng review (Claude)
Plan baseline: Testing Plan row 2 asserts exact counts (Number `3`, remove -> `6`, reload keeps `3`) using a rectangle drawn through the UI.
Runtime evidence: the rectangle is screen-relative; which rows fall inside depends on Kepler's auto-fit viewport and panel widths. Exact-count flakiness not measured.
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R5 E2E determinism | UI-drawn rectangle, exact counts, pending | clusters ~10 degrees apart so any rectangle over the lower-right quarter holds exactly one cluster; keep UI drawing for all cases | keep plan as written |
| R1-R4 | approved | unchanged | unchanged |
Question D7:
D7 — Make the E2E exact counts independent of map zoom?
Header: E2E counts
Options:
A) Far-apart clusters (recommended)
Put the two 3-row clusters about 10 degrees apart on a diagonal so auto-fit puts them in opposite corners; the drawn rectangle covers one corner only. UI drawing path unchanged. Human ~1h / CC ~10 min.
B) Keep as written
Close clusters, same drawing coordinates. Human 0 / CC 0. Risk: counts change with viewport size or Kepler padding, causing flaky CI.

State: approved
Actual answer: A) "Far-apart clusters (recommended)", D7 answer 2026-09-23
Accepted scope: E2E data puts the two 3-row clusters ~10 degrees apart on a diagonal so auto-fit places them in opposite corners; the UI-drawn rectangle covers one corner only; UI drawing path unchanged.
History: none

### R6: Extra unit depth for the builder and cache inputs
Finding: T2, P2, confidence 8/10, coverage gaps: disabled polygon (`nativeFilterPredicate.js:6` returns null when `enabled === false`), polygon filter spanning two datasets (`filter-utils.js:464-481` keeps only layers whose `config.dataId` matches), column-type cache invalidation (`nativeFilterInputs.test.js` has no case), reviewer: eng review (Claude)
Plan baseline: Testing Plan unit row lists layer types, multi-layer AND and deleted layer id only.
Runtime evidence: existing tests cover scalar predicates (`nativeFilterPredicate.test.js:14,20`) and spatial layer inputs (`nativeFilterInputs.test.js:19`).
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R6 unit depth | plan list, pending | add: disabled polygon -> null; two-dataset filter -> each dataset gets only its own layer clause; `nativeFilterInputs` invalidates when a bound column type changes and ignores unrelated tables | plan list only |
| Regression contract | authorized | unchanged | unchanged |
Question D8:
D8 — Add three unit cases the plan misses?
Header: Unit depth
Options:
A) Add all three (recommended)
Disabled polygon returns null; a filter bound to layers on two datasets yields only the matching layer's clause per dataset; nativeFilterInputs invalidates on a bound column-type change and not on unrelated tables. Human ~2h / CC ~10 min.
B) Plan list only
Skip them. Human 0 / CC 0. Risk: disabled toggle or multi-dataset reports regress silently.

State: approved
Actual answer: "Unit test only if comply with dekart agent file rules" (D8 answer 2026-09-23). Checked `AGENTS.md:13-18`: all three target stateless, no-UX, side-effect-free functions (`polygonFilterClause`, `nativeFilterPredicate`, `nativeFilterInputs`), so all three comply; equivalent to A.
Accepted scope: unit cases: disabled polygon -> null; two-dataset filter -> each dataset gets only its own layer clause; `nativeFilterInputs` invalidates on a bound column-type change and not on unrelated tables. Rule for all tests in this plan: unit tests only for stateless, no-UX functions; hook/UI behavior only via Cypress asserting visible DOM (`AGENTS.md:17-23`).
History: none

### R7: TODO for the GEOMETRY upgrade path
Finding: TODO1, P3, confidence 9/10, Resolved Decision (a) (dec-f4dbe00b), reviewer: eng review (Claude)
Plan baseline: shortcut tracked by decision log + in-code `gstack-shortcut` marker only; repo has no `TODOS.md`.
Runtime evidence: `ls TODOS.md` in repo root: absent.
Comparison grid:
| Choice | Current | A | B | C |
|---|---|---|---|---|
| R7 TODO | none, pending | create `TODOS.md` with the Kepler WKB centroid patch item | skip; code marker + decision log suffice | build Kepler patch in this PR (reverses D1) |
Question D10:
D10 — Track the Kepler WKB-centroid fix as a TODOS.md item?
Header: GEOMETRY TODO
Options:
A) Add to TODOS.md
Create TODOS.md with What/Why/Context/Depends-on for patching @kepler.gl/layers WKB centroids and switching charts to bbox-center. Human ~10min / CC ~1 min. New file in repo.
B) Skip (recommended)
The `gstack-shortcut(dec-f4dbe00b)` code marker and decision log already record ceiling and trigger; Dekart has no TODOS.md convention. No new file.
C) Build it now
Reverse D1 and include the Kepler patch in this PR. Human ~1 day / CC ~30 min.

State: approved
Actual answer: A) "Skip (recommended)", D10 answer 2026-09-23 (label order in the sent question: Skip first)
Accepted scope: none; no TODOS.md. The upgrade path stays in the `gstack-shortcut(dec-f4dbe00b)` code marker and decision log.
History: none

Approval readiness: PASS. Scope record (D1, D2); R1 (D9, supersedes D3); R2 (D4); R3 (D5); R4 (D6); R5 (D7); R6 (D8); R7 (D10); regression contract authorized by the iron rule. No deferrals.

## Eng Review Output (2026-09-23)

Target: `docs/widgets-polygon-map-filter-plan.md` on `widget-bug`. Reviewer: /plan-eng-review (Claude). Outside voice: unavailable (Codex binary broken, no native fallback tool).

### Findings and dispositions
- Scope: [P1] (9/10) Open Decision on native `GEOMETRY` (plan line 41) → resolved (a) `literal(false)`, D1.
- A1 [P2] (8/10) `useWidgetFilters.js:53-60`: missing column type behavior unspecified → default "no clause" branch in builder, D9 (D3 guard withdrawn per `AGENTS.md:10-11`).
- CQ1 [P2] (8/10) layer column names as SQL identifiers → `column(name)` + quoting test, D4.
- CQ2 [P3] (8/10) duplicated field lookup `useWidgetFilters.js:54-55` / `nativeFilterPredicate.js:8-9` → `nativeFilterField` helper, D5.
- CQ3 [P3] (7/10) dispatch only documented in plan → ASCII header in builder, D6.
- T1 [P2] (7/10) `widgetsPolygonMapFilter.cy.js:28-38` screen-relative rectangle vs exact counts → far-apart clusters, D7.
- T2 [P2] (8/10) missing unit cases → disabled, two-dataset, cache-type invalidation, D8.
- Regression [P1] scalar filter SQL unchanged beside polygon → authorized contract.
- Perf [P2] (8/10) cache churn from whole-table inputs → covered by D8 contract (type strings only).
- Factual corrections: `table.js:116-138`; `WidgetContents.jsx:265,272`; chip click opens Kepler filter panel, not the specific filter (`ReportPage.jsx:622-626` ignores the index).

### NOT in scope
- Kepler WKB centroid patch: deferred via D1; upgrade trigger in dec-f4dbe00b.
- Bbox/index pre-filter for large datasets: plan accepts per-row cost.
- Native GeoArrow polygon columns (loaders.gl mean-vertex centers): no dataset needs it yet.
- Kepler-first refactor of widget click/brush interactions: tracked separately per plan.
- Opening the specific Kepler filter from a chip: existing `onEdit` opens the filter panel only.

### What already exists
- `nativeFilterPredicate` pattern and direct `@uwdata/mosaic-sql` helpers: reused (no new abstraction layer).
- `nativeFilterInputs.js:9-14` polygon layer bindings: reused; extended with type strings.
- `FilterStrip.jsx:34` `removeFilter` and `onEdit`: reused for the `Map area` chip.
- `state.db.tables[].columns` `{name,type}[]` refreshed at `useWidgetSources.js:56`: reused, no new schema query.
- DuckDB `spatial` + `h3` already loaded (`database.js:109-128`): no new extension work.

### Data flow
```
Kepler visState.filters (polygon, layerId[], value.geometry)
        │  one-way
        ▼
useWidgetFilters (per dataset)
  ├─ nativeFilterField(filter, ds) ── null for polygon → no interactor lookup
  ├─ getFilterRecord(...).cpu non-empty?
  └─ nativeFilterPredicate(filter, ds, layers, columnTypes)
        └─ type==='polygon' → polygonFilterClause
              for layer in filter.layerId where layer.config.dataId===ds:
                point/icon latlng  → isfinite(lng,lat[,alt]) AND ST_Within(ST_Point, P)
                point geo mode     → no clause pending a parity dataset
                arc/line           → both endpoints as above; H3 string fields use cell centroids
                hexagonId          → h3_is_valid_cell ? ST_Within(h3 centroid, P) : false
                geojson text       → bbox-center within P (Rectangle: inclusive BETWEEN)
                geojson GEOMETRY/BLOB → literal(false)   [gstack-shortcut dec-f4dbe00b]
                unknown type / other layer → no clause
              AND of layer clauses | null
        ▼
selection.update({source, clients:∅, predicate}) → every chart on widgets.d_<ds>
```

### Failure modes
| Path | Realistic failure | Test | Handling | User sees |
|---|---|---|---|---|
| Text geometry parse | malformed GeoJSON/WKT row | unit (TRY) | `TRY(...)` fails the row only | row excluded, like Kepler |
| Unknown column type | new DuckDB type or schema lag | unit (D9) | default "no clause" | charts unfiltered for that layer (silent) |
| GEOMETRY dataset | Kepler hides all features | E2E | `literal(false)` | 0 rows, matches empty map |
| Odd column alias | space or quote in name | unit (D4) | `column()` quoting | works |
| Edge-point parity | point exactly on polygon edge | none | none | chart and map may differ by a row (silent) **critical gap, accepted risk in plan** |
| Two datasets | filter spans two datasets | unit (D8) | layer dataId match | correct per dataset |

### Worktree parallelization strategy
Sequential implementation, no parallelization opportunity: each slice extends the same builder switch and the same Cypress spec, so slices land in order 1 → 2 → 3.

## Implementation Tasks
Synthesized from this review's findings, grouped as the Delivery Slices above. Checkbox as you ship; each slice merges only after its Cypress and unit tests pass.

- [x] **S1 (P1, human: ~1.5 days / CC: ~45min)** — Slice 1: point layers end to end
  - Surfaced by: reported bug, D4, D5, D7, D8 (disabled, two-dataset), regression contract, plan step 5
  - Files: `src/client/lib/polygonFilterClause.js` (+ test), `src/client/lib/nativeFilterPredicate.js` (+ test), `src/client/widgets/useWidgetFilters.js` (use `nativeFilterField`), `src/client/widgets/FilterStrip.jsx`, `cypress/e2e/cloud/widgetsPolygonMapFilter.cy.js`
  - Verify: `npx vitest run src/client/lib`; `make cypress-run ENV_FILE=.env.cloud SPEC="cypress/e2e/cloud/widgets*.cy.js"`
  - Implemented proof: 84 frontend unit tests, lint, and both point-layer Cypress cases pass. Cypress draws the rectangle through Kepler UI, then dispatches Kepler's `setPolygonFilterLayer` action because Electron could not pick the unfilled feature border reliably; chart and chip assertions use visible DOM.
- [x] **S2 (P1, human: ~0.5 day / CC: ~20min)** — Slice 2: arc, line and H3 cases
  - Surfaced by: plan semantics table, acceptance criterion 2
  - Files: `src/client/lib/polygonFilterClause.js` (+ test), `cypress/e2e/cloud/widgetsPolygonMapFilter.cy.js`
  - Verify: same commands as S1
  - Implemented proof: `npm test -- --run` passed 90 frontend tests, lint passed, and all three point/H3 polygon Cypress cases passed. Arc/line SQL requires both numeric endpoints inside the area; line altitudes must be finite, and non-point or incomplete endpoint bindings keep the existing no-clause behavior.
- [x] **S3 (P1, human: ~1.5 days / CC: ~45min)** — Slice 3: geometry-column layers and column types
  - Surfaced by: D1, D8 (cache inputs), D9, plan steps 4 and 6
  - Files: `src/client/lib/polygonFilterClause.js` (+ test), `src/client/lib/nativeFilterPredicate.js`, `src/client/widgets/useWidgetFilters.js`, `src/client/lib/nativeFilterInputs.js` (+ test), `cypress/e2e/cloud/widgetsPolygonMapFilter.cy.js`
  - Verify: same commands as S1
  - Implemented proof: `npm test -- --run` passed 98 frontend tests, lint passed, direct DuckDB checks covered GeoJSON, Feature, WKT, malformed text, decimal H3 strings, and fixed-size point arrays, and all seven point/H3/GeoJSON/GEOMETRY/GeoArrow Cypress cases passed. The wider widget and Kepler reload run passed 15 cases with one pre-existing pending spec. H3 string arc/line endpoints use cell centroids; point geojson mode remains without a clause because Kepler does not parse text geometry in that accessor. The GeoArrow Cypress case binds its layer explicitly because the current DuckDB delivery path does not attach `geoarrow.point` metadata for automatic layer creation.

### Unresolved decisions
None.

### Completion summary
- Step 0: Scope Challenge — scope accepted as-is (GEOMETRY resolved to (a), original arrangement)
- Architecture Review: 1 issue found
- Code Quality Review: 3 issues found
- Test Review: diagram produced, 3 gaps identified (flaky E2E counts, missing unit cases, regression contract)
- Performance Review: 1 issue found (covered by D8)
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 1 item proposed to user (skipped)
- Failure modes: 1 critical gap flagged (edge-point parity, accepted risk)
- Unresolved decisions: 0 in this review
- Outside voice: codex, unavailable (broken install, no native fallback tool)
- Parallelization: 3 sequential slices, no parallel lanes
- Lake Score: 2/6 (D4, D8 at 10/10; D1, D5, D6, D7 below)

### Suppressed findings (appendix, confidence ≤ 5)
- (5/10) Between the view swap (`useWidgetSources.js:48`) and schema refresh (`:119`), charts may briefly query with a clause built for the old column type; `TRY` keeps it to transient wrong counts, then the clause rebuilds.
- (3/10) Mosaic pre-aggregation indexes may not apply to spatial predicates; unverified.
- (4/10) Kepler's H3 field typing can select a direct or decimal-converting accessor; DuckDB handles hex strings, integer IDs, and decimal strings, but mixed field inference was not tested end to end.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Outside Review | codex via `/plan-eng-review` | Independent 2nd opinion | 1 | unavailable | broken Codex install; no native fallback tool |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES OPEN (PLAN) | 8 issues, 1 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex, plan-review, unavailable (CLI binary ENOENT; reinstall `npm install -g @openai/codex`), no findings.
- **VERDICT:** no review CLEAR; all 8 issues resolved into plan decisions, 1 accepted-risk critical gap (edge-point parity). eng review required

NO UNRESOLVED DECISIONS
