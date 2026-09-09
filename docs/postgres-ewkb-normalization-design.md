# PostgreSQL EWKB Normalization Design

## Status

Implemented. This document covers the fix for [GitHub issue #280](https://github.com/dekart-xyz/dekart/issues/280).

## Goal

Make PostGIS Point, LineString, Polygon, MultiPoint, MultiLineString, and MultiPolygon values whose coordinates are already map-ready longitude/latitude, normally SRID 4326, parseable by Kepler when returned by PostgreSQL without requiring an encoding workaround such as `ST_AsGeoJSON` or `ST_AsBinary`.

## CRS Non-goal

Normalization does not transform coordinates: EPSG:2154 coordinates would remain Lambert-93 metres, not longitude/latitude. The observed reprojection blocker is separate from issue #280. Known non-4326 geometry requires `ST_AsGeoJSON(ST_Transform(geom, 4326)) AS geometry`; SRID `0` or unknown must be resolved first. Automatic SQL rewriting, CRS lookup, and server-side reprojection are out of scope.

## Evidence

- Dekart's PostgreSQL job scans every result value into `sql.NullString` and writes it unchanged to CSV in `src/server/pgjob/pgjob.go`.
- PostGIS returns geometry in hex-encoded EWKB. The reproduced `MULTIPOLYGON` is `0106000020E610000001000000010300000001000000040000009A99999999992A400000000000404A40CDCCCCCCCCCC2A400000000000404A40CDCCCCCCCCCC2A40CDCCCCCCCC4C4A409A99999999992A400000000000404A40`: type 6, the EWKB SRID flag, SRID 4326, and one polygon.
- Kepler recognizes the value as hex WKB and delegates it to loaders.gl, but loaders.gl calculates an ISO WKB type before removing EWKB flags. The SRID bit is therefore interpreted as an invalid ISO dimension and parsing fails.
- `ST_AsGeoJSON(geom)` and `ST_AsText(geom)` both render because they avoid the failing EWKB parser path.
- Dekart currently pins Kepler 3.2.6 and loaders.gl 4.3.4. The faulty parser order is unchanged in loaders.gl 4.4.3, Kepler 3.3.0 alpha, and loaders.gl `master`, so a dependency upgrade does not fix the issue.

## Proposed Behavior

Normalize PostGIS EWKB values at the PostgreSQL connector boundary:

1. Preserve the existing empty-field serialization of SQL `NULL`. Leave ordinary strings, standard WKB, and non-hex values unchanged.
2. For a hex value whose binary header carries EWKB extension flags, fully validate and normalize it as EWKB.
3. Normalize a completely valid supported value only when every embedded SRID is 4326 or no embedded SRID is present. Treat an EWKB value without an embedded SRID as map-ready on a best-effort basis because the connector cannot discover its CRS.
4. Leave the entire value byte-for-byte unchanged if any geometry header embeds an SRID other than 4326. This preserves the CRS evidence and avoids turning a visible parser failure into silently wrong or offscreen geometry.
5. For accepted values, rewrite EWKB headers as ISO WKB headers, omit embedded SRID fields, copy coordinate bytes unchanged, and write the resulting hex string to the existing CSV output.
6. Preserve geometry type and XY, XYZ, XYM, or XYZM coordinates. ISO WKB intentionally omits SRID because Kepler does not use embedded SRID to reproject coordinates.
7. If a candidate cannot be fully decoded and re-encoded, leave it unchanged. A malformed or coincidentally similar text value must not fail the whole query.

The normalization supports the six geometry families that the pinned loaders.gl WKB parser accepts: Point, LineString, Polygon, MultiPoint, MultiLineString, and MultiPolygon, including empty geometries. GeometryCollection and PostGIS curve/surface extension types remain unsupported and unchanged.

## Normalizer Design

Use a small stdlib-only binary walker rather than adding a geometry-model dependency. The walker reads each geometry header with its declared byte order, validates embedded SRIDs before producing output, converts EWKB Z/M flags into ISO WKB type offsets, omits accepted SRID fields, and recursively processes members of supported multi-geometries. MultiPoint, MultiLineString, and MultiPolygon members must respectively be Point, LineString, and Polygon, and every member must have the same dimensional layout as its parent. Coordinate values are copied without floating-point decoding, so XY, XYZ, XYM, XYZM, NaN empty points, and byte order are preserved exactly.

The parser must be bounded before it allocates or loops: validate every count against the remaining input length using overflow-safe arithmetic, reject unsupported type IDs, and require exact end-of-input consumption. Supported multi-geometries contain only primitive members, so the accepted grammar bounds nesting to one level. Only a completely valid supported EWKB value is replaced. This prevents a short EWKB-like string with attacker-controlled counts from causing a large allocation or silently discarding trailing bytes.

The existing indirect `github.com/paulmach/orb` dependency is unsuitable because its geometry model is two-dimensional and would discard Z/M ordinates. `github.com/twpayne/go-geom` preserves dimensions, but its decoder allocates from encoded element counts and accepts a valid geometry prefix with trailing bytes unless the caller adds safeguards. A bounded representation-preserving walker is smaller than safely wrapping a full geometry decode/re-encode cycle for this task.

## Important Constraints

- Apply the behavior only to PostgreSQL query results. Other connectors and uploaded files keep their current handling.
- Keep the result format as CSV. CSV carries WKB as hex text, not raw binary.
- Design target: a result containing 1,000,000 rows and 100 MB of CSV data must remain practical on the Dekart backend.
- Preserve row streaming and bounded working memory. Memory may include the existing 10,000-row channel plus transient input and output buffers for each normalized cell, but must not scale with the complete result.
- Reject non-candidates from their short header prefix before full hex decoding, so ordinary values pay constant work independent of value length.
- Do not rewrite user SQL or inspect referenced tables. Queries may contain expressions, aliases, CTEs, joins, or functions, and lib/pq does not expose a useful type name for the reproduced PostGIS column through `database/sql`.
- Treat normalization as best-effort value handling. Do not turn a successful database query into a job failure because a string resembles EWKB.
- Do not add an environment flag or change the client/server result contract.
- Leave EWKB with any embedded SRID other than 4326 unchanged. Supporting other geographic CRSs requires separate evidence.
- lib/pq does not identify the reproduced PostGIS column through `database/sql`, so detection is value-based. A text value that is itself a complete, valid supported EWKB payload will be normalized; other non-spatial values remain unchanged. Kepler already classifies such valid EWKB-shaped text as geometry.

## Alternatives Considered

### Convert EWKB to WKT

WKT works in Kepler for coordinates that are already map-ready and is easy to inspect, but the existing orb dependency would lose Z/M data and textual geometry is larger and slower to parse. ISO WKB is the closest compatible representation to the source value.

### Decode and re-encode with `go-geom`

`go-geom` supports EWKB dimensions, but safe use here still requires input-size bounds and an exact-consumption check around its decoder. The binary walker avoids constructing a second in-memory geometry model and preserves coordinate bytes directly.

### Switch PostgreSQL results to Parquet or GeoParquet

Changing the container alone does not help because the same unsupported EWKB bytes would still reach loaders.gl. Proper GeoParquet would require binary WKB conversion, geometry metadata, CRS metadata, a new PostgreSQL result writer, storage/content-type changes, downloads, and wider regression coverage. It may be valuable for performance later, but is disproportionate to this compatibility bug.

### Fix or upgrade loaders.gl

The bug should be reported upstream, but no released or current development version fixes it. Depending only on an upstream release leaves existing Dekart versions broken and does not control the upgrade timeline.

### Ask users to call `ST_AsGeoJSON`, `ST_AsText`, or `ST_AsBinary`

These are valid encoding workarounds for map-ready coordinates but violate the expectation that `SELECT *` from a PostGIS table with SRID 4326 produces a usable map. Only `ST_AsGeoJSON(ST_Transform(geom, 4326))` also addresses a known non-4326 source CRS.

## Acceptance Criteria

- A raw PostGIS 4326 MultiPolygon from issue #280 is emitted as valid hex ISO WKB and renders through the existing Kepler CSV path.
- EWKB with any embedded SRID other than 4326 remains byte-for-byte unchanged; projected geometry requires an explicit transform to 4326.
- Supported point, line, polygon, multi-geometry, empty geometry, XYZ, XYM, and XYZM fixtures preserve their geometry and coordinate layout after normalization.
- Standard WKB and values that are not complete, valid supported EWKB are byte-for-byte unchanged.
- A malformed EWKB-like value does not fail or cancel the query job.
- A representative 1,000,000-row, 100 MB result remains streamed with memory bounded by the existing 10,000-row channel plus transient per-cell normalization buffers, not by total result size.
- PostgreSQL output remains CSV and no frontend change is required.

## Verification Notes

The stateless pgjob tests begin with the exact captured EWKB value. The Cypress regression selects real PostGIS Polygon and MultiPolygon values without an encoding function, then verifies that they reach the browser as normalized ISO WKB and render as a GeoJSON layer. Its CI lane therefore uses a PostGIS-enabled PostgreSQL service.

## Rollout and Follow-up

- Ship as normal PostgreSQL connector behavior without migration or feature flag.
- File an upstream loaders.gl issue with the reproduced EWKB header and parser-order failure; keep the local normalization until a compatible Kepler/loaders.gl release is adopted and verified.
- Evaluate PostgreSQL GeoParquet separately using result size, generation time, browser load time, and memory measurements rather than coupling it to issue #280.
