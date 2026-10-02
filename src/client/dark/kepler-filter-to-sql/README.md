# kepler-filter-to-sql

**Kepler.gl filter records → SQL conditions.**

Scalar SQL conditions use `@uwdata/mosaic-sql` expression objects and can be rendered
as DuckDB SQL. Spatial SQL conditions are supplied by the caller.

## Contents

- [API at a glance](#api-at-a-glance)
- [Interfaces](#interfaces)
  - [Filter](#api-filter)
  - [FilterClause](#api-filterclause)
- [Type Aliases](#type-aliases)
  - [SqlCondition](#api-sqlcondition-1)
- [Functions](#functions)
  - [deriveFilterClauses()](#api-derivefilterclauses)

## API at a glance

| API | Kind | Description |
| :--- | :--- | :--- |
| [Filter](#api-filter) | Interfaces | Library-owned filter projection. |
| [FilterClause](#api-filterclause) | Interfaces | Clause for one binding key. |
| [SqlCondition](#api-sqlcondition-1) | Type Aliases | Mosaic SQL expression; identifiers and literals are escaped by mosaic-sql. |
| [deriveFilterClauses](#api-derivefilterclauses) | Functions | Derive clauses for filters whose `Filter.dataId` contains the supplied dataId. |

## Interfaces

<a id="api-filter"></a>

### Filter

Library-owned filter projection. Values use Kepler's raw field units.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="api-dataid"></a> `dataId` | `string`[] |
| <a id="api-enabled"></a> `enabled?` | `boolean` |
| <a id="api-id"></a> `id` | `string` |
| <a id="api-name"></a> `name` | `string`[] |
| <a id="api-type"></a> `type` | `string` |
| <a id="api-value"></a> `value` | `unknown` |

***

<a id="api-filterclause"></a>

### FilterClause

Clause for one binding key. A null SQL condition represents an inactive constraint.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="api-field"></a> `field` | `string` \| `null` |
| <a id="api-filterid-1"></a> `filterId` | `string` |
| <a id="api-sqlcondition"></a> `sqlCondition` | `ExprNode` \| `null` |

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
   polygonSqlCondition): FilterClause[];
```

Derive clauses for filters whose `Filter.dataId` contains the supplied dataId. activeFilterIds supplies
SQL condition eligibility; inactive or disabled filters yield null SQL conditions.
The caller supplies the SQL condition for each eligible polygon filter.
Missing scalar fields, unsupported scalar types and invalid value shapes throw. Inputs are unchanged.
Scalar identifiers and values are escaped by mosaic-sql; the polygon callback owns its SQL escaping.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `filters` | [`Filter`](#api-filter)[] |
| `dataId` | `string` |
| `activeFilterIds` | `ReadonlySet`\<`string`\> |
| `polygonSqlCondition` | (`filter`) => `ExprNode` \| `null` |

#### Returns

[`FilterClause`](#api-filterclause)[]

#### Example

```ts
import { deriveFilterClauses } from './index'

const filter = {
  id: 'selection', type: 'select', dataId: ['a'],
  name: ['author'], value: "O'Brien\\<script>"
}
const [clause] = deriveFilterClauses([filter], 'a', new Set(['selection']), () => null)
String(clause.sqlCondition) // ("author" IN ('O''Brien\\<script>'))
```
