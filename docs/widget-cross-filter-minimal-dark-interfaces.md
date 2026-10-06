# Smallest dark-library interfaces for widget cross filtering

Status: implementation target approved in this task. Compared with `HEAD` (`25422fc`) on `cross-filtering-on-widgets`.

## Decision to review

Keep the restore library responsible for saving filters before a table is replaced and restoring them after publication. Let the filter-sync library update a **live** widget filter when its checkbox, selected column, or available tables change. Both can call one pure function that finds tables with a column of the same name and compatible type. One widget selection remains one Kepler filter with one value.

To keep this boundary small, disable widget setting changes and deletion while the widget's table is unavailable or calculating. A saved selection may wait for the widget's table to return; the design does not promise to keep filtering another table while the widget's table remains unavailable. This changes the behavior described in [the earlier reconciliation design](widget-cross-filter-reconciliation-design.md), which explicitly supports the case where only the other table is loaded.

## Public interface compared with `HEAD`

| Library | In `HEAD` | Proposed minimum |
| --- | --- | --- |
| `kepler-filter-restore` | `capture(dataId)`, `restore(dataId)`, `remove(dataId)`, `reset()` | **No public change.** Restore the saved filter after publication. Do not add `reconcileCrossFilter`, `FilterInputs`, or matching-table settings to this library. |
| `kepler-mosaic-filter-sync` | `reconcile()` and `dispose()`; `CurrentFilterInputs` supplies live filters and chart bindings | Keep both methods. Add available table fields to `CurrentFilterInputs`, and add the existing widget `crossFilter` boolean to each chart `Binding`. `reconcile()` updates a live filter's table/column pairs before projecting it. No recovery callback or new edit method. |
| `kepler-filter-to-sql` | Derives selection clauses from Kepler filters | No public change. |
| Matching-table function | Absent | Add one pure exported function that accepts widget's table, selected column, checkbox value, available table fields, and current pairs. Return matching pairs and compatible current pairs. Keep its readiness result for a missing column in the widget's table. No state, dispatch, or filter values. |

### Proposed signatures

`kepler-filter-restore` stays exactly as it is in `HEAD`:

```ts
interface FilterRestore {
  reducer: Reducer<KeplerState, AnyAction>
  capture: (dataId: string) => RecoveryAction
  restore: (dataId: string) => RecoveryAction
  remove: (dataId: string) => RecoveryAction
  reset: () => RecoveryAction
}
```

`kepler-mosaic-filter-sync` adds only the checkbox setting and the available fields to its existing inputs. All other `CurrentFilterInputs` and `Options` properties stay as in `HEAD`:

```ts
interface Binding {
  filterId: string
  field: string
  categorical: boolean
  clients: readonly MosaicClient[]
  crossFilter: boolean // whether this selection filters matching tables
}

interface CurrentFilterInputs {
  ready: boolean
  editing: boolean
  table?: { // unchanged Kepler table shape from HEAD
    id: string
    dataContainer: { numRows: () => number }
    fields: ReadonlyArray<{
      valueAccessor?: unknown
      format?: unknown
      filterProps?: { mappedValue?: unknown }
    }>
  }
  filters: readonly KeplerFilter[]
  layers: readonly KeplerLayer[]
  columnTypes: Readonly<Record<string, string>>
  bindings?: readonly Binding[]
  tables: readonly BindingTable[] // added: fields in all loaded tables
}

interface FilterSync {
  reconcile(): void
  dispose(): void
}
```

The matching-table library has one public function. `Binding` here means one table/column pair, local to this library:

```ts
interface Binding { dataId: string; field: string }
interface BindingTable {
  dataId: string
  fields: ReadonlyArray<{ name: string; type: string }>
}

function resolveFilterBindings(input: {
  tables: readonly BindingTable[]
  primaryDataId: string
  field: string
  crossFilter: boolean
  currentBindings: readonly Binding[]
}): {
  ready: boolean
  matchingDataIds: readonly string[]
  skippedDataIds: readonly string[]
  compatibleDataIds: readonly string[]
  bindings: readonly Binding[]
}
```

The app reads widget settings and table fields, passes them to sync, and triggers `reconcile()` when either changes. It removes a deleted widget's filter when handling deletion while the widget's table is ready. The app runs sync after a table is published and restored. It does not pass widget configuration into restore.

## Why the boundary is sufficient under that tradeoff

The saved filter already contains its selected value and paired fields. On reload, `restore(dataId)` can restore what was saved; sync then adjusts its live pairs to the current checkbox and loaded columns. When a matching table arrives later and the widget's table is available, sync adds its pair. When the checkbox turns off, sync removes pairs for other tables. A field change clears the old live selection. None of these operations requires restore to observe each widget edit.

The current implementation does more: it checks pending saved filters against widget settings before restore and updates a live filter on another table while the widget's table is absent. Keeping those guarantees requires either an additional current-settings input to `restore` **and** a way to process changes while no restore occurs, or moving that work into sync/app code. It cannot be achieved by an unchanged `restore(dataId)` alone. This proposal removes those guarantees by preventing widget edits until the widget's table returns and allowing a saved selection to wait for that table.

## Checks before replacing the current implementation

- Public contract tests: checkbox on/off with an existing value, late matching table, incompatible or removed column, field change, and repeated `reconcile()` with no extra dispatch.
- Restore contract tests: replacement of the widget's table keeps the selected value; a missing widget table leaves its filter pending and restores after publication.
- Cypress: save and reload, checkbox on/off, late matching table, and disabled widget changes and deletion while the widget's table is unavailable or calculating. Confirm visible filtered rows after sync completes.

If filtering another table while the widget's table is absent remains required, keep that behavior in scope and revisit the public interface; do not claim this smaller contract preserves it.
