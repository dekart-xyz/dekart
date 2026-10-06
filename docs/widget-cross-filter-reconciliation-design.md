# Widget cross-filter reconciliation

Status: superseded by [the smaller dark-library interface design](widget-cross-filter-minimal-dark-interfaces.md). This document records the earlier approach and is no longer the implementation target.

## Decision

The widget configuration says whether a selected value filters other loaded datasets. A widget still owns **one** Kepler filter. That filter contains its value and paired `dataId`/`name` entries: the first pair is the widget's dataset, followed by datasets with a column of the same name and compatible type.

Whenever the widget configuration, loaded dataset fields, or filter changes, reconciliation makes the filter's pairs match the current configuration. It does not create a filter until the user selects a value in a chart. The checkbox changes the reach of an existing selection without requiring another chart click. If a matching dataset arrives later, an existing selection starts filtering it immediately. If it disappears or its column becomes incompatible, its pair is removed. Turning the checkbox off leaves only the owner pair.

The exact-name and type-class rules remain: integer and real are numeric, string is text, and date, timestamp, boolean, and other types match only their own type. Number widgets do not offer cross-filtering. Native Kepler filters retain their existing behavior.

## What changes on load

Saved Kepler pairs are a snapshot, not a second source of binding intent. On load or dataset recovery, normalize widget-owned pairs to the saved widget setting and currently loaded compatible fields. This can add a newly available dataset, drop an unavailable or incompatible dataset, or replace a previously saved differently named receiver field with the current same-name field. The selected value remains unchanged when only secondary pairs change.

When the owner table or its field metadata is unavailable, do not guess compatible receivers. Check saved filters against the widget's current column and checkbox setting even though its chart cannot yet be shown. Turning the checkbox off leaves only the owner dataset, even without its field metadata. Turning it on adds matching datasets once the owner's column type is known; until then it keeps the saved value without guessing new matches. A receiver that became the live primary while the owner was absent must follow the same current settings. Both publication paths must supply the latest settings to `restore()` so it cannot briefly publish an obsolete receiver or old-column value before a React effect runs.

Changing the widget's field invalidates its old selection, including a selection pending recovery. Reconciliation removes a live owner filter whose primary field differs from the widget's current field. The recovery reducer compares the **saved owner field**, not a receiver field promoted to live primary while the owner is absent, and discards a pending selection only when that saved owner field changed. Deleting the widget removes its live and pending filter; deleting the owner removes its filter from receivers. Removing a receiver releases only that pair. Clearing a chip or all filters still clears the selection everywhere.

## Dark library contracts

### `kepler-filter-bindings`

Keep `resolveFilterBindings` as the pure, shared exact-name/type resolver. Its `bindings` result is the desired owner-first list whenever primary metadata is available, regardless of the previously saved pairs. Keep `currentBindings` only for compatibility checks and for the missing-primary case, where the resolver must report that desired pairs cannot yet be computed; do not treat saved pairs as desired once metadata returns. The app continues using its matching/skipped output for the checkbox hint. No second matching algorithm belongs in React or the sync library.

The public result needs an explicit `ready` indication for missing primary metadata. A caller must not infer readiness from an empty list, because an empty list could otherwise erase a pending selection. Update the generated README and public contract examples for the changed result.

The app passes the current filter settings and available table fields as `FilterInputs`. Each filter entry has its ID, owner dataset, column, and checkbox value. The restore library works out the affected datasets from those inputs. When the owner's column type is unavailable and the checkbox is on, it waits instead of guessing matches. An empty filter list means the widgets were deleted, so the app must use its saved widget configuration until the dashboard configuration has loaded. The same app function supplies this information to the hook and both dataset publication paths; it does not store a second selection value.

### `kepler-mosaic-filter-sync`

The public controller becomes:

```ts
interface FilterSync {
  reconcile(): void
  dispose(): void
}
```

Remove `applyBindingEdit` and `applyFieldEdit`. `CurrentFilterInputs.filterInputs` supplies current settings for all widgets and available table fields, so no separate global filter ID list is needed. `CurrentFilterInputs.bindings` still supplies chart handlers. `reconcile()` reads fresh inputs and, when the owner is ready, performs these steps in order:

1. Remove filters for deleted widgets or a changed primary field.
2. For each remaining widget-owned filter, resolve the desired pairs and dispatch Kepler paired-field actions only when the list differs. Keep its ID, value and enabled state.
3. Read Kepler state again and project the resulting filters to Mosaic. A library-authored projection must not become a chart edit.

Before the owner-ready guard, `reconcile()` sends the current filter inputs to the injected recovery callback described below. This handles saved selections and removes filters for deleted widgets. Once the owner is ready, it updates live filters and projects them. Repeated calls with equal inputs must dispatch nothing, including inside the recovery reducer. Filter changes caused by reconciliation may trigger another call; that call must be a no-op. Chart value events still create or update the one owner filter, after which ordinary reconciliation sets its datasets. No separate checkbox callback calls a dark-library edit method: the app updates the widget setting, and its existing input effect calls `reconcile()`.

Add one injected `Options.reconcileRecovery(filterInputs)` callback. The app maps it to the recovery library's action; the sync library never reads Redux recovery state. The sync library remains responsible for live owner Kepler action order and chart projection. Its `reconcile()` contract now includes filter updates, so its README and public contract tests must change even though the method signature does not.

### `kepler-filter-restore`

Keep capture/remove/reset for dataset replacement. Replace the checkbox-specific `editPendingBindings` command and extend `restore` with current settings:

```ts
interface FilterInputs {
  tables: readonly BindingTable[]
  filters: readonly { filterId: string, dataId: string, field: string, crossFilter: boolean }[]
}
reconcileCrossFilter(filterInputs: FilterInputs, ownedFilterPrefix: string): RecoveryAction
restore(dataId: string, filterInputs: FilterInputs, ownedFilterPrefix: string): RecoveryAction
```

Both commands use the same reducer logic. For every saved filter with `ownedFilterPrefix`, discard it if its widget is gone or its **saved owner** dataset or column differs from the current widget. When the owner's column type is known, calculate the matching datasets and update the saved filter while preserving its value. For a receiver-only live filter while the owner is unavailable, keep only the available matching datasets or release it if none remain; never use that live filter's promoted receiver column to invalidate a saved owner value. If no owner snapshot exists, release a receiver-only value whose column differs from the current setting. When the owner's type is unknown and the checkbox is on, retain saved filters until its data returns. Native filters are untouched. `reconcileCrossFilter` is a no-op with unchanged inputs; `restore` checks current settings inside its transaction before applying Kepler restore actions. The current `preservePendingBindings` marker may remain for live filter actions if the reducer still needs it; remove it only if contract tests prove it unnecessary. Update the generated README and public contracts.

## Application changes

The checkbox callback updates `crossFilter` in widget configuration only. A chart field change updates the field only. The hook must subscribe to all loaded Kepler datasets and their field metadata, not only the owner's table, so receiver arrival, removal, and type changes trigger the owner controller's `reconcile()`. It also observes widget settings and filters. Map `reconcileRecovery` to `reconcileCrossFilter` even while the owner is pending. Both native and DuckDB publication paths read the latest widget settings after table publication and pass them to `restore`; they must not wait for a React effect or mistake a not-yet-loaded configuration for an empty one. Local widget edits must be reflected before restore. Keep the UI hint and current persistence schema. Do not add a new Redux/Zustand selection value or a second Mosaic listener. The server schema already accepts `crossFilter` for Category, Search and Histogram.

## Verification

- Public dark-library contracts: checkbox on/off with an existing selection; repeated reconciliation; a chart click with the checkbox already on; late matching dataset arrival; incompatible type and field removal; field change; deleted owner; and rejected chart edits.
- Recovery contracts with real Kepler reducers: owner and receiver replacement, no live filter with a pending value, checkbox on/off or field change while pending, widget deletion while pending, a promoted receiver with a different field name, and restore before the React effect. Include configuration loading and unsaved edits when reading current settings. Check filtered rows as well as filter records.
- Cloud Cypress on the matching backend: two queries with a shared column, a Search selection, checkbox on/off, save and reload, late dataset arrival, receiver field removal/type change, and owner/receiver replacement. Assert visible filtered results and controls.
- Run dark checks, generated README verification, lint, and the affected Cypress specs. Preserve existing independent filter behavior for a receiver's own widget.

## Implementation plan

1. Change `kepler-filter-bindings` contracts to return desired pairs with explicit missing-primary status; update its README and public tests.
2. Make `kepler-mosaic-filter-sync.reconcile()` normalize live widget filter pairs and clear old-field filters; remove its two edit methods and update its README and public tests.
3. Replace the checkbox-specific recovery command with idempotent setting checks inside restore; update its README and public tests.
4. Simplify widget settings callbacks, subscribe the hook to all loaded dataset fields, and pass current settings at both restore call sites; remove obsolete app wiring.
5. Update the affected Cypress scenarios and run the checks above, resolving any recovery ordering failure before finishing.

## Dark API changes

- `kepler-filter-bindings`: add explicit readiness to `resolveFilterBindings` output; desired pairs are computed from current fields and setting once ready.
- `kepler-mosaic-filter-sync`: remove `applyBindingEdit` and `applyFieldEdit`; `reconcile()` now normalizes widget-owned Kepler pairs before projection.
- `kepler-filter-restore`: replace `editPendingBindings` with `reconcileCrossFilter(filterInputs, ownedFilterPrefix)` and extend `restore(dataId)` to `restore(dataId, filterInputs, ownedFilterPrefix)`. Both read current settings and available fields before restoration.
