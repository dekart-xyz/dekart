# kepler-filter-bindings

Resolve compatible field bindings for cross filtering across loaded tables.

## Contents

- [API at a glance](#api-at-a-glance)
- [Interfaces](#interfaces)
  - [Binding](#api-binding)
  - [BindingTable](#api-bindingtable)
- [Functions](#functions)
  - [resolveFilterBindings()](#api-resolvefilterbindings)

## API at a glance

| API | Kind | Description |
| :--- | :--- | :--- |
| [Binding](#api-binding) | Interfaces | One table ID and field name paired in a filter. |
| [BindingTable](#api-bindingtable) | Interfaces | Field metadata for a loaded table. |
| [resolveFilterBindings](#api-resolvefilterbindings) | Functions | Find exact-name, compatible targets and validate saved pairs against the primary field's type. |

## Interfaces

<a id="api-binding"></a>

### Binding

One table ID and field name paired in a filter.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="api-dataid"></a> `dataId` | `string` | ID of the table containing the bound field. |
| <a id="api-field"></a> `field` | `string` | Name of the field in that table. |

***

<a id="api-bindingtable"></a>

### BindingTable

Field metadata for a loaded table.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="api-dataid-1"></a> `dataId` | `string` | ID used to bind filters to this table. |
| <a id="api-fields"></a> `fields` | readonly `object`[] | Current fields, each with its exact name and type used for compatibility. |

## Functions

<a id="api-resolvefilterbindings"></a>

### resolveFilterBindings()

```ts
function resolveFilterBindings(__namedParameters): object;
```

Find exact-name, compatible targets and validate saved pairs against the
primary field's type. Missing primary metadata reports ready=false and leaves
saved pairs untouched until the caller can calculate current targets.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `__namedParameters` | \{ `crossFilter`: `boolean`; `currentBindings`: readonly [`Binding`](#api-binding)[]; `field`: `string`; `primaryDataId`: `string`; `tables`: readonly [`BindingTable`](#api-bindingtable)[]; \} | - |
| `__namedParameters.crossFilter` | `boolean` | Whether same-name, compatible fields in other tables should be included. |
| `__namedParameters.currentBindings` | readonly [`Binding`](#api-binding)[] | Pairs already present on the filter, used to check compatibility while projecting. |
| `__namedParameters.field` | `string` | Selected field name in the primary table. |
| `__namedParameters.primaryDataId` | `string` | Table that owns the selected field. |
| `__namedParameters.tables` | readonly [`BindingTable`](#api-bindingtable)[] | Loaded tables and their current field names and types. |

#### Returns

| Name | Type | Description |
| ------ | ------ | ------ |
| `bindings` | readonly [`Binding`](#api-binding)[] | Primary pair followed by matching pairs, or unchanged current pairs while not ready. |
| `compatibleDataIds` | readonly `string`[] | Current pairs whose fields have a type compatible with the primary field. |
| `matchingDataIds` | readonly `string`[] | Other tables with a field of the same name and compatible type. |
| `ready` | `boolean` | Whether the primary field is available and targets can be calculated. |
| `skippedDataIds` | readonly `string`[] | Other tables with a field of the same name but a different type class. |
