# Kepler–Mosaic filter sync

## Goal

Move the three responsibilities in `useWidgetFilters` into one client dark library,
`src/client/dark/kepler-mosaic-filter-sync/`: remove filters whose owning panel was
deleted, write Kepler filters into the Mosaic selection as SQL clauses, and turn genuine Mosaic
interactions into Kepler filter edits. Leave `useWidgetFilters` as a small,
reviewed adapter for app stores and presentation scheduling.

Kepler filters are the only authored filter values. A Mosaic interaction is a
command. Every chart value and SQL clause is derived from the latest Kepler
state. The sync is eventually consistent, and reconciliation is simple and
deterministic: the last Kepler dispatch is the state, and Mosaic always
returns to it. The existing `kepler-filter-to-sql` library remains the SQL
builder and is imported only through its public entry.

## Behavior changes

The move preserves current hook behavior except for these three changes:

1. A user selection that Kepler does not accept is rolled back in Mosaic and
   on screen.
2. A binding with no Kepler filter has its chart's clause and displayed value
   cleared whenever Kepler filters are applied to charts.
3. Display-only filter edits no longer re-send filters to charts.

## Public contract

The library exposes one factory. It owns one Mosaic selection and one Kepler
data binding for its lifetime. Its methods and types are exported through
`index.ts`; the generated README describes them without app-specific names.

```ts
interface Binding {
  filterId: string           // Kepler filter identity owned by this binding
  field: string              // current field, not the field at event capture
  categorical: boolean       // the chart uses nested values; Kepler needs a flat list
  // The chart's Mosaic interaction handlers (brush, click handler, search box).
  // The one whose `selection` is this selection creates the chart's own clauses.
  clients: readonly MosaicClient[]
}

interface CurrentFilterInputs {
  ready: boolean             // false while data is loading or being replaced
  editing: boolean
  table?: KeplerDataset
  filters: readonly KeplerFilter[]
  layers: readonly KeplerLayer[]
  columnTypes: Readonly<Record<string, string>>
  bindings?: readonly Binding[] // undefined until binding configuration loads
}

interface Options {
  dataId: string
  selection: MosaicSelection
  // A deleted owner has no binding; this prefix distinguishes its filter
  // from ordinary filters during orphan cleanup.
  ownedFilterPrefix: string
  current(): CurrentFilterInputs // reads live state, including inside deferred work
  dispatch(action: KeplerAction): void
  // apply returns true only when it dispatched a Kepler action; the caller
  // then waits for downstream presentation. Returns cancellation of pending work.
  defer(apply: () => boolean): () => void
  onUserEdit(): void         // a chart interaction changed a filter while `editing` is true
  onProjected(): void        // after Kepler filters were written to the selection, including rollbacks
  onError(message: string): void // one generic sentence; '' after the next successful update of the selection
}

interface FilterSync {
  reconcile(): void          // called when an observed input changes; safe to repeat
  dispose(): void            // idempotent
}

function createKeplerMosaicFilterSync(options: Options): FilterSync
```

`MosaicClient`, `MosaicSelection`, and the Kepler types are structural subsets
of the third-party contracts, not Dekart store or proto types. A
`MosaicClient` has `selection`, a writable `value`, and `clause(value)`, which
returns a selection clause with the handler as `source` and the set of charts
the clause must not filter as `clients`. The factory installs the selection
listener.

The library may depend on Kepler, Mosaic, `kepler-filter-to-sql/index`, and its
own files. It must not import the app's Redux/Zustand stores, actions, widget
store, generated proto, or presentation scheduler. The `nativeFilterInputs`
calculation moves into the library as a private helper. No library-owned Redux
slice, external store, timer, or mutable module-level state.

## Reconciliation rules

### `reconcile()`

1. **Wait when not ready.** If `ready` is false, or `table` or `bindings` is
   unavailable, do nothing: no pruning, no clause changes.
2. **Prune owned orphans, synchronously, on every call.** Eligible filters have
   the configured prefix and this `dataId` as their primary binding. Remove
   those whose ID matches no current `Binding.filterId`, by ID against the
   latest filter array, in reverse index order. A filter whose primary binding
   belongs elsewhere is never removed. Pruning never calls `onUserEdit`.
3. **Skip a true no-op, synchronously.** Build a key from the inputs that
   decide what charts receive, compare it with the key of the last successful
   update, and return without calling `defer` if equal. The key holds:
   - for every binding: filter ID, field, categorical flag and client identities;
   - for every filter on this `dataId`: id, type, enabled, value, field binding;
   - the membership inputs computed by the moved `nativeFilterInputs` helper.

   It holds no filter object identities, `Binding` wrapper identities, or bare
   layer identities: Kepler replaces filter objects on display-only edits and
   mutates layers in place, and the adapter rebuilds wrappers on each read.
4. **Defer one update.** Cancel any pending update and call `defer`.
   The deferred callback reads `current()` again and never applies inputs
   captured before the defer. It returns `false`.
5. **Derive once.** Use Kepler's CPU filter record with `ignoreDomain`, then
   `deriveFilterClauses` with current layers and column types. Disabled,
   full-domain, scalar, and polygon filters all enter the desired set; an
   inactive condition is `null`. Prepare the entire set before the first
   `selection.update`. A derivation error changes no Mosaic clause.
6. **Replace by stable ID.** A binding's handler is its client whose
   `selection` is this selection. For each filter ID, the clause source is the
   owning binding's handler, or a stable library-owned source for that filter ID if it has no
   owning binding or the binding has no handler yet. Reusing a source replaces
   its predicate without an unfiltered gap. When a binding's handler was
   replaced, clear the old handler's clause first. Clear sources absent from
   the desired set. A chart must not be filtered by a clause on its own field:
   the clause's `clients` is the union of `handler.clause(handler.value).clients`
   over all bindings on the clause's field. For an owned filter, set the
   handler's `value` and the clause value to the Kepler filter value in the
   chart's shape: each item wrapped in a list for a categorical binding, the
   value as is otherwise. When the filter is disabled or inactive, use `null`
   for a categorical binding and `undefined` otherwise. For a filter with no
   owning binding, the clause value is a fixed non-null marker when active and
   `null` when inactive. For a binding with no Kepler filter, clear its
   handler's clause and `value` the same way.
7. **Finish.** On success, store the key, call `onError('')` and
   `onProjected()`. On error, discard the key so the next call retries, and
   call `onError` with the generic sentence.

### Selection `value` events

8. **Ignore the library's own updates by origin.** Mark every clause object the library
   creates in an instance-owned `WeakSet` before `selection.update`. An event
   whose active clause is in the set is not a user command, even when Mosaic
   delivers it asynchronously. Do not compare values or use an `isApplying` flag.
9. **Capture.** Ignore events while `ready` is false, and events whose clause
   source is no binding's client. Otherwise capture the source, the binding's
   filter ID and field, the editing mode, and the value: `null` when the clause
   has no predicate (a reset), else the clause value, flattened by one level
   for a categorical binding. Discard the stored key and replace any pending
   intent for this selection.
10. **Apply at deferred execution.** Read `current()`. Discard the intent if its
    binding or its handler disappeared, its field or handler changed, readiness was
    lost, or the editing mode changed. Otherwise resolve the current filter
    index and enable, update, create, or remove the filter with Kepler actions.
    Later Kepler edits do not invalidate the intent: the click applies over the
    latest state (last writer wins). Call `onUserEdit` only when a filter
    changed in edit mode. The callback returns whether it dispatched.
11. **Roll back.** When an intent ends without a Kepler change (superseded,
    discarded, failed, or equal to the current filter), the library calls
    `reconcile()` itself. A failed command also calls `onError`. After an
    accepted command, the app's observation of the Kepler change calls
    `reconcile()`.

### `dispose()`

12. Cancel the pending update and intent, remove the listener, then reset
    the selection. No pending callback acts after disposal.

### Known limitation

Mosaic drops a queued, undelivered `value` event when a later update has the
same source. If the library updates the selection while a user event is still queued
behind a pending emit, that click is lost and the Kepler-derived clause stands. State stays
consistent; the click is not preserved.

## Reviewed adapter

`useWidgetFilters` keeps only app-specific reads and wiring: Redux and SQLRooms
subscriptions, selection lookup, mapping panels and client registrations into
`Binding` (`categorical` is true for Category and Search charts), `current()`,
`deferWidgetFilter` as `defer`, dispatch, the edit marker, and the returned
error. It creates and disposes one controller per selection and calls
`reconcile` when filters, layers, table, columns, panels, clients, readiness,
or editing mode change. It does not interpret filter values or duplicate
orphan, clause, or event decisions. Target: roughly 25–40 lines.

`onProjected` drives a dataset-scoped signal that `HistogramChart` adds to its brush re-sync
effect, so a rolled-back range brush returns to the Kepler range.

## Contract tests

The library skips implementation review, so its contract tests are the proof.
Put real effort into them: every rule above needs a case that fails when the
rule is broken, and every case runs against real dependencies.

Black-box tests import only `./index` plus third-party packages. They use:

- a real Kepler reducer and store (fixture pattern in
  `kepler-filter-restore/examples.test.ts`);
- a real Mosaic selection (`Selection.crossfilter()`);
- Mosaic's real handlers as clients: `Toggle` for categorical bindings and
  `Interval1D` for range bindings, both exported by `@uwdata/mosaic-plot`. Both
  construct and build clauses without a DOM. Each needs only a plain object for
  the chart mark: `{ plot: { markSet }, channelField: () => ({ field, as }) }`;
- deterministic `defer` callbacks supplied through the public interface.

User interactions are simulated the way the handlers do it: set
`handler.value`, then `selection.update(handler.clause(value))`. To exercise
asynchronous delivery, register a second listener on the selection that
returns an unresolved promise; that makes Mosaic queue events. Tests assert
Kepler actions/state, Mosaic-visible clauses/values and callback calls, not
internals. No module or global mocks, no fake timers, no hand-built imitation
of a handler.

What these tests cannot prove, and Cypress must: the Search box's own handler
(app code; it builds the same clause shape as `Toggle`), whether a drawn brush
moves on screen, real frame scheduling, and the adapter's wiring.

| Contract | Cases |
| --- | --- |
| Kepler → Mosaic | scalar select/range, polygon, disabled/full domain, edited field/layer/type, restored filter, multiple filters on one field, a chart is not filtered by a clause on its own field (owned filter and filter with no owning binding), handler `value` and clause value in the chart's shape for categorical and range bindings, disabled filter clears with `null` or `undefined`, binding without a handler uses a library-owned source, replaced handler, binding with no Kepler filter is cleared, `onProjected` after each selection update |
| Errors | malformed input and time range (unsupported by `kepler-filter-to-sql`) report the error and change no clause; a following valid update applies and sends `''` |
| Mosaic → Kepler | categorical value flattened, range value, event from an unknown source ignored, reset, unchanged selection, disabled filter, missing filter, changed field, edit marker in editing mode only, event while not ready ignored |
| Ownership | deleted owner, deleted owner whose binding never had a handler, receiver with a shared filter, unrelated prefixed ID, multiple orphans, removed dataset, missing bindings/table during load |
| No-op | presentation, GPU mode, unrelated layer and unrelated column-type changes call `defer` zero times and leave clauses untouched; value, enabled, type, field binding, data revision, accessor/format and bound spatial column-type changes produce exactly one selection update |
| Ordering | two rapid clicks on one binding; click then reset; clicks on two bindings inside one defer window (first rolled back, second lands); queued click then an edit to the same filter (the click applies); queued click then unrelated orphan removal; edit/view switch with a queued click (rolled back); failed command (rolled back); queued update then newer filter state; the library's own update delivered asynchronously is ignored; user event queued behind a pending emit then a library update on the same source (click lost, state consistent); dispose with pending work; dispose twice |

The No-op row replaces `src/client/lib/nativeFilterInputs.test.js`; cover every
case that file covers. For each ordering case, run the deferred callbacks in
both relevant orders and assert that Kepler state and the Mosaic clauses
agree at the end. Use table-driven values for filter variants and targeted
sequences for interactions.

Cypress covers the adapter. Keep the existing widget specs and add two cases:
a rapid interaction while presentation is deferred, and a rolled-back
histogram brush returning to the Kepler range.

## Implementation Plan

1. Add `@uwdata/mosaic-plot` 0.21.1 as a dev dependency (today it is installed
   only transitively; the tests import `Toggle` and `Interval1D` from it).
2. Add `src/client/dark/kepler-mosaic-filter-sync/` with the public contract
   and failing black-box tests.
3. Implement the reconciliation rules in the library, moving the logic from
   `useWidgetFilters` and `nativeFilterInputs`.
4. Replace `useWidgetFilters` with the adapter, add the `onProjected` brush
   re-sync to `HistogramChart`, and delete `src/client/lib/nativeFilterInputs.js`
   and its test.
5. Add the two Cypress cases.
6. Generate the README. Run strict typecheck, lint, dark checks, the contract
   tests, and the cloud widget Cypress specs.
7. List the new dark API under `Dark API changes` in the PR.
