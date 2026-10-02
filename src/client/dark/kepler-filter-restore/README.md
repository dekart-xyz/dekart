# kepler-filter-restore

**Restore authored Kepler.gl filters after data replacement clears, clamps or drops them.**

A reducer wrapper captures filters by Kepler table binding ID, restores them with
current table metadata, and discards recovery superseded by explicit filter edits.
Plain actions target one Kepler instance. Recovery belongs to Redux state and
is excluded from authored map configuration.

## Contents

- [API at a glance](#api-at-a-glance)
- [Interfaces](#interfaces)
  - [FilterRestore](#api-filterrestore)
- [Type Aliases](#type-aliases)
  - [KeplerState](#api-keplerstate)
  - [RecoveryAction](#api-recoveryaction)
- [Functions](#functions)
  - [createFilterRestore()](#api-createfilterrestore)

## API at a glance

| API | Kind | Description |
| :--- | :--- | :--- |
| [FilterRestore](#api-filterrestore) | Interfaces | Reducer and commands for one Kepler instance; no middleware or external snapshot storage. |
| [KeplerState](#api-keplerstate) | Type Aliases | Kepler's instance map, mounted at any Redux key; recovery metadata belongs to each selected instance. |
| [RecoveryAction](#api-recoveryaction) | Type Aliases | Plain instance-addressed command; dispatch it without inspecting its private payload. |
| [createFilterRestore](#api-createfilterrestore) | Functions | Wrap a configured Kepler root reducer for one `keplerInstanceId`. |

## Interfaces

<a id="api-filterrestore"></a>

### FilterRestore

Reducer and commands for one Kepler instance; no middleware or external snapshot storage.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="api-capture"></a> `capture` | (`dataId`) => [`RecoveryAction`](#api-recoveryaction) | Save the first JSON-compatible authored filter records containing this Kepler table binding ID. |
| <a id="api-reducer"></a> `reducer` | `Reducer`\<[`KeplerState`](#api-keplerstate), `AnyAction`\> | Mount in place of the supplied Kepler root reducer. Preserves normal Kepler commands and Redux identity on no-ops. |
| <a id="api-remove"></a> `remove` | (`dataId`) => [`RecoveryAction`](#api-recoveryaction) | Discard recovery for one table binding; unknown IDs are harmless. |
| <a id="api-reset"></a> `reset` | () => [`RecoveryAction`](#api-recoveryaction) | Discard all recovery for this instance, including when its current tables are absent. |
| <a id="api-restore"></a> `restore` | (`dataId`) => [`RecoveryAction`](#api-recoveryaction) | Restore pending records using current Kepler tables. Unavailable primary bindings remain pending. Errors propagate without consuming recovery. |

## Type Aliases

<a id="api-keplerstate"></a>

### KeplerState

```ts
type KeplerState = Record<string, Partial<KeplerGlState>>;
```

Kepler's instance map, mounted at any Redux key; recovery metadata belongs to each selected instance.

***

<a id="api-recoveryaction"></a>

### RecoveryAction

```ts
type RecoveryAction = Action<
  | "kepler-filter-restore/capture"
  | "kepler-filter-restore/restore"
  | "kepler-filter-restore/remove"
| "kepler-filter-restore/reset">;
```

Plain instance-addressed command; dispatch it without inspecting its private payload.

## Functions

<a id="api-createfilterrestore"></a>

### createFilterRestore()

```ts
function createFilterRestore(options): FilterRestore;
```

Wrap a configured Kepler root reducer for one `keplerInstanceId`. Capture before
replacement and restore after publication. Snapshots live in Redux, outside
authored map configuration; no mutable closure state is retained. Explicit scalar
and polygon edits cancel affected pending records. Forwarded commands affect only
their addressed map; unaddressed Kepler commands retain broadcast behavior.
Missing filters recover ID, type, geometry and surviving paired field bindings;
existing filters recover values and enabled state using real Kepler updaters.
Inputs must contain JSON-compatible Kepler values. Validation/updater errors
propagate; unavailable primary tables retain records for a later restore.
Instance deletion or minted re-registration discards its pending recovery.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | \{ `keplerInstanceId`: `string`; `keplerReducer`: `Reducer`\<[`KeplerState`](#api-keplerstate), `AnyAction`\>; \} |
| `options.keplerInstanceId` | `string` |
| `options.keplerReducer` | `Reducer`\<[`KeplerState`](#api-keplerstate), `AnyAction`\> |

#### Returns

[`FilterRestore`](#api-filterrestore)

#### Example

```ts
import keplerGlReducer from '@kepler.gl/reducers'
import { createFilterRestore } from './index'

const recovery = createFilterRestore({
  keplerInstanceId: 'map', keplerReducer: keplerGlReducer
})
// Mount recovery.reducer; dispatch these around data replacement.
const capture = recovery.capture('table-id') // before replacement
const restore = recovery.restore('table-id') // after publication
```
