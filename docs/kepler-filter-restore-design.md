# Kepler filter restoration: reducer interface

Status: implemented and reviewed; focused recovery checks pass. The broader polygon reload gate has an unresolved local failure; the same Named points test passes on main in CI. The local control was not a complete baseline, so pre-existing ownership is unproven.

## Goal and public interface

Restore authored Kepler filters after replacement data clears, clamps or drops
those filters. One reducer owns the saved snapshots, intentional-edit cancellation
and restoration. The module exports one factory. Reconciliation and saved-record
types remain private. Callers never supply saved or live filter sets.

```js
const recovery = createFilterRestore({
  keplerInstanceId: 'kepler',
  keplerReducer: configuredKeplerReducer
})

// Mount this in place of configuredKeplerReducer.
const reducer = recovery.reducer

// Plain Redux actions; no thunks or middleware.
dispatch(recovery.capture(dataId))
// Replace data, wait for publication, and pass existing stale-work checks.
dispatch(recovery.restore(dataId))

dispatch(recovery.remove(dataId)) // Forget one binding.
dispatch(recovery.reset())        // Forget all pending snapshots.
```

| Public member | Behavior |
| --- | --- |
| `reducer` | Wraps the supplied Kepler reducer; owns snapshots and handles filter commands |
| `capture(dataId)` | Creates an action that saves the first authored filters containing dataId |
| `restore(dataId)` | Creates an action that applies pending recovery to current Kepler state |
| `remove(dataId)` | Creates an action that discards recovery for one data binding |
| `reset()` | Creates an action that discards all pending recovery |

## TypeScript interface

```ts
import type { KeplerGlState } from '@kepler.gl/reducers'
import type { Action, AnyAction, Reducer } from 'redux'

type KeplerState = Record<string, Partial<KeplerGlState>>
type RecoveryAction = Action<
  | 'kepler-filter-restore/capture'
  | 'kepler-filter-restore/restore'
  | 'kepler-filter-restore/remove'
  | 'kepler-filter-restore/reset'
>

export interface FilterRestore {
  reducer: Reducer<KeplerState, AnyAction>
  capture: (dataId: string) => RecoveryAction
  restore: (dataId: string) => RecoveryAction
  remove: (dataId: string) => RecoveryAction
  reset: () => RecoveryAction
}

export function createFilterRestore(options: {
  keplerInstanceId: string
  keplerReducer: Reducer<KeplerState, AnyAction>
}): FilterRestore
```

`KeplerState` is the instance map returned by Kepler's root reducer, not application
root state. Action creators return plain actions with private payloads and Kepler's
forwarding metadata. Callers dispatch them rather than inspecting their envelopes.

`keplerInstanceId` selects the Kepler map receiving recovery. `keplerReducer` is
the existing configured Kepler root reducer, including its initial-state settings
and any existing plugins. The library wraps it rather than replacing Kepler's
normal action handling. Create the wrapper once during store setup.

## State ownership and reducer flow

Recovery metadata lives under a library-prefixed private key on the selected
Kepler instance record, separate from `visState.filters` and authored map config.
It contains only pending projected filter records keyed by dataId. No mutable
closure or module-level snapshot map exists.

The wrapper removes its metadata from the selected record before calling the base
reducer, because Kepler's combined reducers do not preserve unregistered state keys.
It reattaches the updated metadata only if that instance still exists afterward;
Kepler instance removal discards it. Do not introduce a fake instance at the root
map level. Kepler schemas and map export must not include this metadata. Test the
preservation explicitly, including two composed wrappers for different instances.

The wrapper receives only the Kepler slice. It can read its selected instance
before and after calling the supplied reducer, without knowing application keys,
reports, charts, query sources or download controllers.

For a library command, unwrap only a matching instance address and apply the
corresponding recovery operation. Pass the command through the base reducer as
needed to preserve any existing reducer extensions. Unknown actions and other
instances retain ordinary Kepler behavior.

For a normal Kepler command:

1. Read the selected instance's previous filters and pending recovery.
2. Run the supplied Kepler reducer once.
3. For explicit scalar edits/removal and polygon editor commands, identify the
   affected filter IDs from the command and the before/after filter sets.
4. Remove those IDs from every pending snapshot in that instance.
5. Return the new Kepler state with its recovery metadata preserved.

Automatic table replacement does not cancel recovery. The library's restore
command performs its updater operations internally; those operations are not
separately dispatched as user commands. Forwarded actions for other Kepler maps
do not cancel this instance's snapshots. Unaddressed actions follow Kepler's
normal broadcast behavior.

This before/after access is why the reducer wraps Kepler rather than being an
independent sibling reducer or an after-only `.plugin(...)` handler. A sibling
cannot read another reducer's newly computed state; an after-only plugin loses
the previous index-to-filter-ID mapping for removals. No middleware is needed.

## Capture, restoration and cleanup

- `capture` saves the first authored filters containing dataId. Repeated captures
  preserve the first snapshot through repeated empty/error replacements.
- `restore` reconciles pending saved filters with live filters by ID, using current
  Kepler tables, field metadata and layers. Unrelated live filters remain intact.
- Existing filters recover authored value and enabled state. Live domain metadata
  comes from current tables, not old snapshots.
- Missing scalar filters are recreated with their ID, type and field bindings.
  Missing polygon filters retain geometry and layer bindings.
- Restore secondary bindings only while their tables still exist. Keep binding
  IDs and field names paired.
- Apply real Kepler filter updaters. Do not assign a replacement filter array,
  which would leave filtered rows and layer data stale. Resolve indices by ID
  after each operation.
- Consume successfully restored records. Unavailable primary bindings remain
  pending until they can be restored or are explicitly removed/reset.
- `remove` discards pending records for one dataId. `reset` discards all pending
  records for the selected instance, even when the instance has no current tables.
- Only supported, JSON-compatible Kepler filter records are valid snapshots.
  Validation errors propagate. A failed reduction must not publish partially
  updated recovery metadata or consume the snapshot.

Snapshots are provisional recovery data, not a second authoritative filter store.
An empty snapshot is harmless. Absent-instance capture/restore are no-ops; reset
and remove still clear any retained metadata on an existing instance record. Preserve Redux identity when neither
Kepler nor recovery state changes. Do not mutate reducer inputs directly; retain
Kepler's normal third-party table/layer object semantics.

## Application boundary and migration

The application mounts `recovery.reducer` in place of its configured Kepler
reducer and uses the four plain action creators at existing publication/removal
points. Delete `actions/keplerFilterRestore.js` and its middleware registration.
Do not add a replacement middleware, root-state locator or scope helper.

Report close or replacement dispatches `recovery.reset()` before new publication
work. Existing report/controller guards remain in publication code and must pass
before capture and restore. Reset clears saved records but cannot itself identify
stale asynchronous callbacks: an old callback could otherwise consume a newer
snapshot for the same dataId. The library does not inspect reports or detect
navigation. Publication waits remain with the code that owns publication.

Preserve existing app-specific Kepler action/error handling when installing the
wrapper. The application-only wiring document may mention these integration
points; the generated library README uses only Kepler filters/state, instance
addresses and explicit commands.

Remove obsolete exports: `FilterSnapshot`, `RestoreContext`, manual `observe`,
restoration dispatch callbacks, `getFilters`, `hasDataId`, `getKeplerState`,
`getScope` and lifetime arguments. No standalone reconciliation function is public.
There is no plugin registration or middleware field on the new factory result.

## Validation

Use real Kepler reducers/tables and a real Redux store. Public contract tests import
only the library entry; no mocks or private-helper imports. Demonstrate equivalent
behavior under different app mount keys and isolate two Kepler instances.

Protect meaningful cases: emptied categories; clamped ranges; enabled state;
scalar/polygon recreation; surviving secondary bindings; explicit edits/removal
while recovery is pending; polygon visibility commands; repeated capture; other
instances and broadcast/forwarded action targeting; absent startup state; reset
without current tables; repeated reset; unavailable primary tables; errors retaining
snapshots; no-op identity; ordinary Kepler actions preserving recovery metadata;
metadata excluded from exported map configuration. Assert filtered rows/layer
results as well as filter values.

Regenerate the README from public API comments and short inline usage examples;
keep contract tests and fixtures separate from the README. Run dark
checks, unit contracts and lint. Cypress verifies native PostgreSQL and DuckDB
empty/error replacement, deliberate removal, report close/reset during pending
publication, stale work rejected by existing report/controller guards, and existing
widget/filter suites. Classify the previously observed polygon reload failure
against the original bridge or fix it before claiming the full regression gate is green.

## Implementation plan

1. Add public capture/restore action and reducer contract tests with real Kepler state.
2. Wrap the configured Kepler reducer and keep pending snapshots in library Redux state.
3. Move private restoration and explicit-command cancellation into that wrapper.
4. Install the wrapper and plain actions at existing publication/removal points;
   reset on report close/replacement and retain existing asynchronous-work guards.
5. Delete the old adapter, middleware and obsolete exports; regenerate docs.
6. Run contract/static checks and integration Cypress; resolve review findings.

## Dark API changes

`createFilterRestore` now accepts a Kepler instance ID and configured reducer,
and returns the wrapped reducer plus four plain action creators. The imperative
capture/restore/observe interface and its public saved-record/context types are
removed. The generated README documents the reducer interface with short inline
usage examples, without imported test cases or fixtures.

## Verification results

- `make dark-check`, `npm run lint`, `npx vitest run` (130 tests, including
  17 restoration contracts) and `npm run build` pass.
- Real-Kepler contracts cover two composed map wrappers, arbitrary Redux mount
  keys, no-op identity, exported configuration, unavailable-table retry, explicit
  edits, paired secondary bindings and polygon filtering through a bound point
  layer. A real polygon updater error preserves the snapshot for another attempt.
- Empty capture snapshots are consumed on restore; otherwise the first publication
  without filters prevented every subsequent authored capture. Both its failing
  contract and the DuckDB error/retry browser case protect this regression.
- Cloud `widgetsFirstSlice.cy.js` (2), `keplerFilterReload.cy.js` (4),
  `widgetsReload.cy.js` (1), and `keplerFilterRestoreLifecycle.cy.js` (1) pass.
  PostgreSQL `keplerFilterRestore.cy.js` (1) passes empty-result, query-error and
  deliberate-removal recovery. The lifecycle test leaves recovery pending after
  a real error and closes the report while the retry RPC is held. It does not
  pause inside Kepler's publication callback; that exact race remains unproven.
- The clean review has no actionable findings. Its Docker README exclusion and
  missing CI spec-registration findings are fixed.
- The broader polygon spec passes 3/4 cases on the final full retry. Named-point
  reload expects 3 rows but shows 6. The same failure reproduces with the original
  HEAD widget bridge and recovery disabled, but that control did not restore the
  complete baseline. The same Named points case passes on main at `8de78f4` in
  CI, so ownership of the local failure is unresolved. An earlier hexadecimal H3 initialization failure passes on retry;
  neither observation makes the full polygon regression gate green.

Local control evidence: `/tmp/dekart-b-reducer-polygon-original-no-recovery.log`.
Focused browser evidence is in `cypress/videos/widgetsReload.cy.js.mp4`,
`cypress/videos/keplerFilterRestoreLifecycle.cy.js.mp4`, and
`cypress/videos/keplerFilterRestore.cy.js.mp4`.
