# Saved Map Config Layer Ownership Design

## Goal

Keep saved Kepler layer choices authoritative while preserving one useful default: a dataset first published during an open browser session gets an inferred layer.

Two regressions define the required behavior:

- A saved blank report is reopened, its existing dataset produces its first query result, and one layer must appear.
- A user removes and saves a layer, then adds another dataset; only the new dataset may receive an inferred layer.

## Decision

- Keep `report.map_config` a pure Kepler v1 document.
- Add no server field, proto message, database column, migration, RPC, or MCP-specific state.
- Add one session-local array of dataset IDs to the existing client dataset reducer.
- Never infer layers merely because a completed dataset appears in the first report-stream update.
- Allow an initially blank dataset, or a dataset first observed later in the session, to infer a layer once when its first non-empty result reaches Kepler.
- Pass `autoCreateLayers: false` for every other insertion, replacement, rerun, and recomputation.
- Apply a saved config with `config.visState.layers: []`; an empty layer list is a valid user decision.
- Preserve automatic layer-panel opening after dataset publication, but do not count that programmatic action as user map work.
- Keep Kepler's existing tooltip inference unchanged. This design owns automatic layers only.

## Root Cause

Kepler's `addDataToMap` infers layers unless `options.autoCreateLayers` is false. Dekart currently omits that option when a dataset is absent from Kepler. Applying a saved config can clear Kepler datasets, so a later dataset update can reinsert an old dataset with inference enabled and recreate a removed layer.

`shouldUpdateMapConfig` also ignores any incoming config whose layer list is empty. That prevents an intentionally empty saved list from clearing local layers and must be removed.

## Client State

Add one array in the existing dataset Redux state, conceptually `autoCreateLayerIds`. It is cleared when a report opens or closes.

Membership means only: "the next non-empty first insertion may ask Kepler to infer a layer." It is not report data and is never saved.

An ID enters the array when:

1. the dataset is first observed after initial report hydration; or
2. the dataset is present during initial hydration but has no publishable result or stored file yet.

An ID leaves the array when:

- its first non-empty insertion into Kepler succeeds;
- the dataset is removed; or
- an observable live saved map config is accepted and supersedes local defaults.

The array survives intermediate stream updates because dataset creation and result publication are asynchronous.

## Reconciliation

For each report-stream update:

1. Before replacing the previous report state, identify initial hydration, whether serialized `report.mapConfig` changed from the preceding Redux report, and dataset IDs newly observed by this client.
2. On initial hydration, apply the canonical saved config first, then seed datasets with no result or stored source yet. Initial config application never cancels this blank-dataset exception.
3. On later updates, call `receiveReportUpdateMapConfig` only when the serialized map config observably changed and the existing conflict and save-version gates allow it. Empty layer lists participate in the same structural comparison as non-empty lists.
4. Keep two local booleans separate. `liveConfigAccepted` means an observable live document passed those gates. `mapConfigApplied` means it also changed Kepler state.
5. Clear all pending inference IDs when `liveConfigAccepted` is true, even if the incoming document is structurally equivalent to current Kepler state. The explicit complete document owns the layer decision.
6. If no live config was accepted, retain pending IDs and add newly observed IDs.
7. Download or compute data through the existing warehouse, file, and DuckDB paths. Re-download or recompute after config reconciliation only when `mapConfigApplied` is true.
8. Immediately before a first `addDataToMap`, read current pending membership and verify the active report ID. Do not capture permission when scheduling asynchronous work because a later accepted config may revoke it.
9. Consume permission only after a non-empty first insertion succeeds. Failed and zero-row first results remain eligible.
10. Replacements and reruns always preserve existing configuration with layer inference disabled.

An initially unbound blank dataset remains eligible if the user later configures it as a warehouse or DuckDB query. An already configured DuckDB dataset restored after reload is not eligible because its earlier browser-publication history is unavailable.

For a pending DuckDB dataset, do not insert a zero-row first result into Kepler. The result can remain available to DuckDB dependencies, while a later non-empty result performs the first Kepler insertion. Zero-row reruns of an already published dataset continue to replace its data and preserve layers.

## Layer Panel and Conflict Tracking

The existing map-conflict gate uses `hasOpenedKeplerPanel` to distinguish user-visible map work from Kepler defaults. Dataset publication also opens the layer panel as established UX, but that programmatic action must not arm the gate.

Mark the existing programmatic panel action so `hasOpenedKeplerPanel` ignores it. Capture subsequent user interaction inside the panel with a dedicated marker action that arms the existing conflict gate before an edit. This preserves the established publication UX while preventing inferred defaults from blocking a later authoritative config, without maintaining an edit-action inventory.

## DuckDB Saved-Config Reload

Applying `receiveMapConfig` resets Kepler datasets. Warehouse and file data are already scheduled for re-download when a config is applied, but DuckDB currently reruns only for dataset, job, or dependency changes.

When `mapConfigApplied` is true, trigger the existing full `runDuckDBGraph` path after accepted live config clears pending inference. Republished DuckDB datasets use `autoCreateLayers: false`, so saved layers bind to restored data without creating extras. An accepted but structurally equivalent document revokes inference without needlessly rerunning the graph. This reuses the current graph runner and adds no execution state.

## Two Editors

This feature does not change Dekart's existing last-write-wins report saves or conflict UX.

- If editor A adds a dataset, editor B observes a new dataset ID and may infer one layer locally when its data arrives.
- If A saves an observably different config, B applies it when the existing conflict gate allows. If B has local map work, Dekart shows the existing conflict and B must reload to accept A's config.
- If B receives a new dataset and an accepted live config in one stream snapshot, the config clears pending permission before insertion, preventing a duplicate layer.
- If both editors save conflicting configs, existing last-write-wins and report snapshots remain unchanged.

The current stream and report timestamps do not provide causal ordering for every tightly raced write. A byte-identical config rewrite is also indistinguishable from no layer decision. Those are existing collaboration limitations. Solving them requires a separate versioned-command design across the full multi-field report save and is deliberately outside this client-layer fix.

After a conflict reload, an initially blank dataset is eligible again. Without durable publication intent, the client cannot distinguish an explicit empty config for that future result from an ordinary saved blank report, so the first later result may infer a layer. A stored zero-row file reopened later is similarly treated as completed rather than as pending. These are deliberate consequences of keeping state session-local.

## MCP

MCP continues to read and write standard Kepler v1 JSON only.

- `update_report_map_config` remains a complete replacement operation.
- A changed config with `layers: []` is authoritative when applied through the normal stream path.
- An agent creating data while no UI is open should write the complete desired config; a later UI load does not infer layers for already completed datasets.
- If an MCP-created dataset is observed live before an observably changed config, the browser may infer a temporary layer. The later applied config replaces it unless the user performed separate unsaved map work.

No compatibility handling is required because no stored or API contract changes.

## Alternatives Rejected

### Add metadata to `map_config`

Rejected because it overloads a Kepler-owned document and creates compatibility and MCP preservation work.

### Persist dataset publication history separately

Rejected because a database field and contract exist only to recover an ambiguous history that the observed UI flow does not require.

### Add report-wide save CAS in this fix

Rejected because `UpdateReport` also owns title, query text, parameters, and readme. Correct CAS conflict preservation and rollout must cover every field and dataset mutation, which is a separate collaboration project.

### Infer from absence of a saved layer

Rejected because absence is a valid user choice and cannot prove a layer was never generated.
