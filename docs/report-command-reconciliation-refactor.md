# Report commands and streamed updates

Status: proposed

## Decision

CQS does **not** require pausing updates for every command. Commands write; the stream supplies canonical content. With the current reconciliation, the save response can advance the observed version before an older stream frame arrives, and a save during README removal can write the old README back. Retain the existing protection for `UpdateReport` and `RemoveReadme`, but put its entire lifecycle beside `reportUpdate`, not in individual commands or generic RPC transport.

`src/client/actions/report.js` owns this capability: **submit a versioned mutation and reconcile its streamed result while preserving local drafts**. No dark library: this is application orchestration over protobuf, Redux and map/widget save acknowledgements. No new module or dependency is needed.

## Exact public contract

The client remains JavaScript; these are the exported call signatures:

```js
// Redux thunk -> Promise<boolean>
export function reportCommand(method, buildRequest, onAccepted = () => {})
// Existing signatures remain unchanged:
export function reportUpdate(reportStreamResponse)
export function openReport(reportId, snapshot = false)
export function closeReport()
export function saveMap(mapViewChanged = false)
// Defined in actions/readme.js, not re-exported:
export function removeReadme()
```

- `method` is exactly `Dekart.UpdateReport` or `Dekart.RemoveReadme`; this is not an automatic wrapper for all RPCs.
- `buildRequest(stateAtSend)` synchronously returns the corresponding generated request, or `false` to skip. It runs after any permitted wait and navigation check, using fresh state. The wrapper sets `report_id` and `expected_version_id` from that state; builders only fill operation-specific fields.
- Optional `onAccepted(response, stateAtSend, dispatch)` is synchronous acknowledgement work, never stream reconciliation. `saveMap` uses it for its existing preview export and `savedReport` dispatch, in their current order. Removal needs no callback. Canonical content is never synthesized from an acknowledgement.
- Return `true` on the existing success condition, `false` on rejection, skipped save or cancelled removal. No command writes deferred fields, wraps RPC callbacks, dispatches saving-status events, catches transport errors, or releases streams.

Preserve these existing policies inside the owner; expose no completion-mode flags:

| Command | Overlap | Success / saving indicator |
|---|---|---|
| `UpdateReport` | Return `false` while already saving; retain conflict gates. | Acknowledgement and save bookkeeping complete; release stream processing. |
| `RemoveReadme` | Wait for the preceding command, then recheck navigation and build from fresh state. | Acknowledgement releases stream processing; completion waits for canonical content to be applied. |

Map `Aborted` errors retain streamed conflict reporting; removal failures retain generic error reporting and leave the README visible. Keep the current stale-frame rejection and command-identity checks. A rejected, closed or replaced removal must never complete a later command.

## Caller and lifecycle

```js
// actions/readme.js
export function removeReadme() {
  return reportCommand(Dekart.RemoveReadme, () => new RemoveReadmeRequest())
}

// Existing page setup / cleanup; commands create no subscriptions.
dispatch(openReport(reportId))
await dispatch(removeReadme())
dispatch(closeReport())
```

`reportCommand`, `reportUpdate` and `closeReport` jointly own the existing pending-command state in `report.js`: pausing, rejecting stale frames, accepting RPC results, waiting for canonical content, failure cleanup and navigation cleanup. `reportStatus.saving` keeps its existing meaning, with status dispatch owned by the wrapper. Preserve current save-versus-removal navigation behavior; this extraction must not silently introduce broader cancellation.

The app owns request payloads, draft/conflict decisions, save-baseline and preview bookkeeping, and rendering. `grpcCall` owns only transport/auth/error delivery and keeps its signature. Other setters and `AddReadme` retain their current command/stream behavior.

## Delete and deduplicate

Remove lifecycle code from `removeReadme` and `saveMap`, including their Promise/RPC adapters, saving-status dispatches and cleanup blocks. Fold private `callReportUpdate` into the complete command owner; keep any needed pause/receive helpers private there. Move the actual `removeReadme` definition back to `actions/readme.js` and update `ReportPage.jsx`, its tests and reducer imports; add no re-export. Remove command-specific removal completion dispatch from `reportUpdate` and use the owner's common status handling. No files stop existing; retain regression tests.

## Public interface diff against HEAD

```diff
+ // actions/report.js
+ export function reportCommand(method, buildRequest, onAccepted = () => {})
  // actions/readme.js: removeReadme remains defined here, as in HEAD.
+ // Existing working-tree proto changes, retained rather than introduced here:
  message RemoveReadmeRequest {
+   optional string expected_version_id = 2;
  }
  message RemoveReadmeResponse {
+   string version_id = 1;
  }
```

Against the current working tree, also remove the `actions/report.js` export of `removeReadme`; callers use its real definition in `actions/readme.js`. Keep both existing RPCs, wire fields and command action signatures; no generic RPC options or new externally visible states.

## Behavior pinned by tests

- `cypress/e2e/cloud/reportSaveRegression.cy.js`: own-stream-before-response, conflict handling, stale removal rejection, MCP removal without a version, unsaved layer preservation, and immediate save/reload after removal.
- `cypress/e2e/cloud/queryParameterStream.cy.js`: typed parameter drafts during accepted saves and remote updates.
- `cypress/e2e/pg-s3/missingQueryResultRecovery.cy.js` and `cypress/e2e/local/mapConfigAutoLayers.cy.js`: initial-layer/save preservation.
- Preserve the six removal action regressions, including queued rejection, replacement and navigation. Cypress has no equivalent for every queue/navigation permutation; report that gap rather than deleting those tests.

## Needs a plan change

Removing pausing entirely, making every command wait for the stream, serializing all mutations, or changing cancellation/error behavior changes the current contract. Those require a separate behavior plan and regression proof through `dekart-implement`; do not conceal them behind wrapper options. UUID versions are equality tokens, not ordered revisions; the stream sequence is a process-local notification counter, and stream payload reads are not one database snapshot. This doc does not claim those provide a total ordering that makes all pausing safely removable. Coalesced/reconnected updates and late save acknowledgements across navigation lack complete Cypress coverage and are not redesigned here.
