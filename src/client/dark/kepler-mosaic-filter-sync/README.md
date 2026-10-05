# kepler-mosaic-filter-sync

Keep a Mosaic selection derived from Kepler filters and apply chart selections
back to the latest Kepler state.

## Contents

- [API at a glance](#api-at-a-glance)
- [Interfaces](#interfaces)
  - [Binding](#api-binding)
  - [CurrentFilterInputs](#api-currentfilterinputs)
  - [FilterSync](#api-filtersync)
  - [KeplerFilter](#api-keplerfilter)
  - [KeplerLayer](#api-keplerlayer)
  - [MosaicClient](#api-mosaicclient)
  - [MosaicSelection](#api-mosaicselection)
  - [Options](#api-options)
- [Functions](#functions)
  - [createKeplerMosaicFilterSync()](#api-createkeplermosaicfiltersync)

## API at a glance

| API | Kind | Description |
| :--- | :--- | :--- |
| [Binding](#api-binding) | Interfaces | One chart's filter identity, current field and registered interaction handlers. |
| [CurrentFilterInputs](#api-currentfilterinputs) | Interfaces | Live inputs. |
| [FilterSync](#api-filtersync) | Interfaces | Reconcile live filters or release the selection. |
| [KeplerFilter](#api-keplerfilter) | Interfaces | A filter with the field index used by Kepler's CPU predicates. |
| [KeplerLayer](#api-keplerlayer) | Interfaces | A layer with the spatial and display properties read by Kepler. |
| [MosaicClient](#api-mosaicclient) | Interfaces | A chart interaction handler that owns a selection clause and displayed value. |
| [MosaicSelection](#api-mosaicselection) | Interfaces | The event and clause operations needed from one Mosaic selection. |
| [Options](#api-options) | Interfaces | Injected state, scheduling and feedback for one selection and data binding. |
| [createKeplerMosaicFilterSync](#api-createkeplermosaicfiltersync) | Functions | Create one controller for a Mosaic selection. |

## Interfaces

<a id="api-binding"></a>

### Binding

One chart's filter identity, current field and registered interaction handlers.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="api-categorical"></a> `categorical` | `boolean` | Whether chart values are category lists rather than numeric ranges. |
| <a id="api-clients"></a> `clients` | readonly [`MosaicClient`](#api-mosaicclient)[] | Interaction handlers registered for this chart. |
| <a id="api-field"></a> `field` | `string` | Field selected for this chart's filter. |
| <a id="api-filterid"></a> `filterId` | `string` | Stable ID of the filter controlled by this chart. |

***

<a id="api-currentfilterinputs"></a>

### CurrentFilterInputs

Live inputs. Undefined bindings or table, or false ready, postpone reconciliation.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="api-bindings"></a> `bindings?` | readonly [`Binding`](#api-binding)[] | Current chart bindings; absence postpones reconciliation. |
| <a id="api-columntypes"></a> `columnTypes` | `Readonly`\<`Record`\<`string`, `string`\>\> | Column types by name for spatial filter derivation. |
| <a id="api-editing"></a> `editing` | `boolean` | Whether a user edit should be reported through onUserEdit. |
| <a id="api-filters"></a> `filters` | readonly [`KeplerFilter`](#api-keplerfilter)[] | Current Kepler filters, including filters outside this binding. |
| <a id="api-layers"></a> `layers` | readonly [`KeplerLayer`](#api-keplerlayer)[] | Current layers used to resolve spatial filters. |
| <a id="api-ready"></a> `ready` | `boolean` | Whether reconciliation may proceed; false postpones it. |
| <a id="api-table"></a> `table?` | `object` | Current Kepler table; absence postpones reconciliation. |
| `table.dataContainer` | `object` | Data source used by Kepler's CPU filter predicates. |
| `table.dataContainer.numRows` | () => `number` | Current row count, used to detect changes to CPU filter inputs. |
| `table.fields` | readonly `object`[] | Field metadata indexed by each filter's fieldIdx entry. |
| `table.id` | `string` | Table binding ID, matched against filter dataId entries. |

***

<a id="api-filtersync"></a>

### FilterSync

Reconcile live filters or release the selection. Both methods are safe to repeat.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="api-dispose"></a> `dispose` | () => `void` | Cancel pending work, remove the selection listener, and clear the selection. |
| <a id="api-reconcile"></a> `reconcile` | () => `void` | Project current Kepler filters into Mosaic when inputs changed. |

***

<a id="api-keplerfilter"></a>

### KeplerFilter

A filter with the field index used by Kepler's CPU predicates.

#### Extends

- `Filter`

#### Indexable

```ts
[key: string]: unknown
```

Other Kepler filter properties passed through without interpretation.

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="api-dataid"></a> `dataId` | `string`[] | Data binding IDs; each position corresponds to the same position in name. | `Filter.dataId` |
| <a id="api-enabled"></a> `enabled?` | `boolean` | False disables this filter's SQL condition. | `Filter.enabled` |
| <a id="api-fieldidx"></a> `fieldIdx?` | `number`[] | Field positions for each entry in dataId. | - |
| <a id="api-id"></a> `id` | `string` | Stable identity carried into the derived FilterClause. | `Filter.id` |
| <a id="api-layerid"></a> `layerId?` | `string`[] | Layer IDs used to derive a polygon filter's spatial condition. | `Filter.layerId` |
| <a id="api-name"></a> `name` | `string`[] | Filter field names paired with dataId entries. | `Filter.name` |
| <a id="api-type"></a> `type` | `string` | Kepler filter kind, such as select, multiSelect, range, or polygon. | `Filter.type` |
| <a id="api-value"></a> `value` | `unknown` | Scalar value or polygon geometry in the shape required by type. | `Filter.value` |

***

<a id="api-keplerlayer"></a>

### KeplerLayer

A layer with the spatial and display properties read by Kepler.

#### Extends

- `LayerBinding`

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="api-centroids"></a> `centroids?` | `unknown` | Layer centroids used by Kepler's spatial predicate. | - |
| <a id="api-config"></a> `config` | `object` | Data binding and columns used to locate geometry or coordinates. | `LayerBinding.config` |
| `config.columnMode?` | `string` | Position mode used by point, arc, line, or GeoArrow layers. | - |
| `config.columns` | `Record`\<`string`, `ColumnBinding` \| `undefined`\> | Column bindings keyed by the names supported for this layer type. | - |
| `config.dataId` | `string` | Data binding ID this layer belongs to. | - |
| <a id="api-datatofeature"></a> `dataToFeature?` | `object` | Feature data that may supply centroids when the layer does not. | - |
| `dataToFeature.centroids?` | `unknown` | Centroids associated with the layer's features. | - |
| <a id="api-id-1"></a> `id` | `string` | Layer ID matched against a polygon filter's layerId entries. | `LayerBinding.id` |
| <a id="api-type-1"></a> `type` | `string` | Kepler layer kind used to select the spatial condition. | `LayerBinding.type` |

***

<a id="api-mosaicclient"></a>

### MosaicClient

A chart interaction handler that owns a selection clause and displayed value.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="api-clause"></a> `clause` | (`value`) => `SelectionClause` | Build this handler's selection clause for a value. |
| <a id="api-selection"></a> `selection?` | [`MosaicSelection`](#api-mosaicselection) | Selection this handler belongs to, when registered. |
| <a id="api-value-1"></a> `value` | `unknown` | Value currently displayed by the handler. |

***

<a id="api-mosaicselection"></a>

### MosaicSelection

The event and clause operations needed from one Mosaic selection.

#### Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="api-active"></a> `active` | `readonly` | `SelectionClause` | Most recent selection clause. |
| <a id="api-addeventlistener"></a> `addEventListener` | `public` | (`type`, `callback`) => `void` | Observe selection value changes. |
| <a id="api-removeeventlistener"></a> `removeEventListener` | `public` | (`type`, `callback`) => `void` | Stop observing selection value changes. |
| <a id="api-reset"></a> `reset` | `public` | () => `unknown` | Clear this selection's clauses. |
| <a id="api-update"></a> `update` | `public` | (`clause`) => `unknown` | Add or replace the clause for its source. |

***

<a id="api-options"></a>

### Options

Injected state, scheduling and feedback for one selection and data binding.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="api-current"></a> `current` | () => [`CurrentFilterInputs`](#api-currentfilterinputs) | Read the latest filter, binding, and editing state whenever reconciliation runs. |
| <a id="api-dataid-1"></a> `dataId` | `string` | ID of the data binding whose filters are reconciled. |
| <a id="api-defer"></a> `defer` | (`apply`) => () => `void` | Let the chart UI show pending feedback before running apply, which may trigger synchronous Kepler CPU filtering. Return a cancellation function. If apply returns true, wait for the changed map to render before finishing; false means no map change needs to render. |
| <a id="api-dispatch"></a> `dispatch` | (`action`) => `void` | Apply a Kepler filter action to the authoritative state. |
| <a id="api-onerror"></a> `onError` | (`message`) => `void` | Receives an error message, or an empty string after successful projection. |
| <a id="api-onprojected"></a> `onProjected` | () => `void` | Called after Kepler filters have been projected into the selection. |
| <a id="api-onuseredit"></a> `onUserEdit` | () => `void` | Called after a user edit changes a Kepler filter while editing is enabled. |
| <a id="api-ownedfilterprefix"></a> `ownedFilterPrefix` | `string` | Prefix identifying filters this controller may remove when their bindings disappear. |
| <a id="api-selection-1"></a> `selection` | [`MosaicSelection`](#api-mosaicselection) | Selection to update from Kepler filters and observe for user edits. |

## Functions

<a id="api-createkeplermosaicfiltersync"></a>

### createKeplerMosaicFilterSync()

```ts
function createKeplerMosaicFilterSync(options): FilterSync;
```

Create one controller for a Mosaic selection. Kepler is authoritative: accepted
interactions dispatch over current state; rejected interactions are projected
back from it. Derivation errors preserve existing clauses and report a generic
error. Call dispose when the selection is no longer owned.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`Options`](#api-options) |

#### Returns

[`FilterSync`](#api-filtersync)
