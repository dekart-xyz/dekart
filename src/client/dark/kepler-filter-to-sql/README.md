# kepler-filter-to-sql

**Kepler.gl filter records → SQL conditions.**

Scalar SQL conditions use `@uwdata/mosaic-sql` expression objects and can be rendered
as DuckDB SQL. Spatial SQL conditions use supplied layer bindings and column types.

## Contents

- [API at a glance](#api-at-a-glance)
- [Interfaces](#interfaces)
  - [ColumnBinding](#api-columnbinding)
  - [Filter](#api-filter)
  - [FilterClause](#api-filterclause)
  - [LayerBinding](#api-layerbinding)
- [Type Aliases](#type-aliases)
  - [SqlCondition](#api-sqlcondition-1)
- [Functions](#functions)
  - [deriveFilterClauses()](#api-derivefilterclauses)

## API at a glance

| API | Kind | Description |
| :--- | :--- | :--- |
| [ColumnBinding](#api-columnbinding) | Interfaces | A named column reference; a negative field index means an optional altitude binding is inactive. |
| [Filter](#api-filter) | Interfaces | Library-owned filter projection. |
| [FilterClause](#api-filterclause) | Interfaces | Clause for one binding key. |
| [LayerBinding](#api-layerbinding) | Interfaces | A layer selected by ID and data binding key. |
| [SqlCondition](#api-sqlcondition-1) | Type Aliases | Mosaic SQL expression; identifiers and literals are escaped by mosaic-sql. |
| [deriveFilterClauses](#api-derivefilterclauses) | Functions | Derive clauses for filters whose `Filter.dataId` contains the supplied dataId. |

## Interfaces

<a id="api-columnbinding"></a>

### ColumnBinding

A named column reference; a negative field index means an optional altitude binding is inactive.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="api-fieldidx"></a> `fieldIdx?` | `number` | Kepler field position; a negative value disables optional altitude. |
| <a id="api-value"></a> `value?` | `string` \| `null` | Bound column name; null or absence leaves it unbound. |

***

<a id="api-filter"></a>

### Filter

Library-owned filter projection. Scalar values use Kepler's raw field units.
Polygon values contain GeoJSON `geometry` and may contain `properties.shape`
`Rectangle` with a four-number `properties.bbox`; `layerId` names the bound layers.
Invalid polygon geometry may throw during SQL derivation.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="api-dataid"></a> `dataId` | `string`[] | Data binding IDs; each position corresponds to the same position in name. |
| <a id="api-enabled"></a> `enabled?` | `boolean` | False disables this filter's SQL condition. |
| <a id="api-id"></a> `id` | `string` | Stable identity carried into the derived FilterClause. |
| <a id="api-layerid"></a> `layerId?` | `string`[] | Layer IDs used to derive a polygon filter's spatial condition. |
| <a id="api-name"></a> `name` | `string`[] | Filter field names paired with dataId entries. |
| <a id="api-type"></a> `type` | `string` | Kepler filter kind, such as select, multiSelect, range, or polygon. |
| <a id="api-value-1"></a> `value` | `unknown` | Scalar value or polygon geometry in the shape required by type. |

***

<a id="api-filterclause"></a>

### FilterClause

Clause for one binding key. A null SQL condition represents an inactive constraint.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="api-field"></a> `field` | `string` \| `null` | Matched scalar field, or null for polygon and unbound filters. |
| <a id="api-filterid-1"></a> `filterId` | `string` | ID of the filter that produced this clause. |
| <a id="api-sqlcondition"></a> `sqlCondition` | `ExprNode` \| `null` | SQL constraint, or null when this filter is inactive. |

***

<a id="api-layerbinding"></a>

### LayerBinding

A layer selected by ID and data binding key. Supported bindings are:
point/icon: `lng`, `lat`, optional `altitude`; arc/line in `points` mode:
`lng0`, `lat0`, `lng1`, `lat1`, optional `alt0`/`alt1`; hexagonId: `hex_id`;
geojson: `geojson`; GeoArrow point: `geoarrow`; GeoArrow arc/line:
`geoarrow0`, `geoarrow1`. `columnMode` is `points`, `geoarrow`, or `geojson`
where applicable. Unsupported combinations contribute no condition.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="api-config"></a> `config` | `object` | Data binding and columns used to locate geometry or coordinates. |
| `config.columnMode?` | `string` | Position mode used by point, arc, line, or GeoArrow layers. |
| `config.columns` | `Record`\<`string`, [`ColumnBinding`](#api-columnbinding) \| `undefined`\> | Column bindings keyed by the names supported for this layer type. |
| `config.dataId` | `string` | Data binding ID this layer belongs to. |
| <a id="api-id-1"></a> `id` | `string` | Layer ID matched against a polygon filter's layerId entries. |
| <a id="api-type-1"></a> `type` | `string` | Kepler layer kind used to select the spatial condition. |

## Type Aliases

<a id="api-sqlcondition-1"></a>

### SqlCondition

```ts
type SqlCondition = ExprNode;
```

Mosaic SQL expression; identifiers and literals are escaped by mosaic-sql.

## Functions

<a id="api-derivefilterclauses"></a>

### deriveFilterClauses()

```ts
function deriveFilterClauses(
   filters,
   dataId,
   activeFilterIds,
   spatial): FilterClause[];
```

Derive clauses for filters whose `Filter.dataId` contains the supplied dataId. activeFilterIds supplies
SQL condition eligibility; inactive or disabled filters yield null SQL conditions.
Spatial layers and column types supply polygon SQL conditions. Missing scalar fields, unsupported
scalar types and invalid value shapes throw. Point/icon and numeric endpoint layers use
finite coordinates; H3 uses valid cell centers; GeoArrow needs fixed-size float arrays;
text GeoJSON/WKT uses geometry-bound centers; native GEOMETRY/BLOB yields false.
Unsupported or unbound layers contribute no condition. Column types are needed only for
GeoArrow, text geometry, and H3 string conversions. Inputs are unchanged. Mosaic SQL
builders escape scalar and spatial identifiers and values; no SQL is executed.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `filters` | [`Filter`](#api-filter)[] |
| `dataId` | `string` |
| `activeFilterIds` | `ReadonlySet`\<`string`\> |
| `spatial` | \{ `columnTypes`: `Readonly`\<`Record`\<`string`, `string`\>\>; `layers`: readonly [`LayerBinding`](#api-layerbinding)[]; \} |
| `spatial.columnTypes` | `Readonly`\<`Record`\<`string`, `string`\>\> |
| `spatial.layers` | readonly [`LayerBinding`](#api-layerbinding)[] |

#### Returns

[`FilterClause`](#api-filterclause)[]

#### Example

```ts
import { deriveFilterClauses } from './index'

const filter = {
  id: 'selection', type: 'select', dataId: ['a'],
  name: ['author'], value: "O'Brien\\<script>"
}
const [clause] = deriveFilterClauses([filter], 'a', new Set(['selection']), { layers: [], columnTypes: {} })
String(clause.sqlCondition) // ("author" IN ('O''Brien\\<script>'))

const area = { id: 'area', type: 'polygon', dataId: ['a'], name: [],
  layerId: ['points'], value: { geometry: { type: 'Polygon',
    coordinates: [[[0, 0], [1, 0], [0, 1], [0, 0]]] } } }
const layers = [{ id: 'points', type: 'point', config: { dataId: 'a', columnMode: 'points',
  columns: { lng: { value: 'odd"longitude' }, lat: { value: 'latitude' } } } }]
const [spatial] = deriveFilterClauses([area], 'a', new Set(['area']), { layers, columnTypes: {} })
String(spatial.sqlCondition) // Identifier is escaped as "odd""longitude"
```
