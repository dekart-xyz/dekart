# Review plan: widgets-v1

22 files in plan, 14 not in plan. Generated 2026-09-19, revised after the dataset-sync change. Scope is the unstaged working tree plus untracked files; staged changes are excluded as already reviewed.

## Contracts

- [src/server/dekart/widgets_config_v1.schema.json:1](../src/server/dekart/widgets_config_v1.schema.json#L1) `widgets_config_v1`: closed V1 schema, `additionalProperties:false` at every level; the persisted trust boundary for chart type, settings, ids and panel order. Currently staged rather than unstaged, listed here because the server code below depends on it.

## Workflows, hardest to reverse first

### 1. Report save

Change: the report revision is the single compare-and-swap authority, and the submitted widget configuration is validated and stored verbatim with no server-side content rewriting.

1. [src/client/actions/report.js:652](../src/client/actions/report.js#L652) `saveMap` [version]: passes the pre-save `report.versionId` as the acknowledgement baseline so a late response can be matched to the request that produced it.
2. [src/server/dekart/report.go:990](../src/server/dekart/report.go#L990) `UpdateReport` [writes] [version] [concurrency]: reads `version_id` under the existing row lock, enforces the CAS check, validates the widget config, writes it as submitted, and returns the new `version_id`.
3. [src/server/dekart/report.go:980](../src/server/dekart/report.go#L980) `validateExpectedReportVersion` [version]: the report revision compare-and-swap, nil expectation is FailedPrecondition and mismatch is Aborted.
4. [src/server/dekart/widgetsconfig.go:64](../src/server/dekart/widgetsconfig.go#L64) `validateWidgetsConfig` [writes]: size cap, closed schema validation, dashboard key/id equality, report-wide unique panel ids, exact `panelOrder` cover, required field for non-count Number panels.
5. [src/server/dekart/report.go:339](../src/server/dekart/report.go#L339) `createReportSnapshotWithVersionIDTx` [writes]: copies `widgets_config` into the snapshot from the same report revision as `map_config`.
6. [src/client/actions/report.js:568](../src/client/actions/report.js#L568) `savedReport`: carries the pre-save `expectedVersionId` alongside the committed `versionId` and widget revision.
7. [src/client/reducers/reportReducer.js:120](../src/client/reducers/reportReducer.js#L120) `reportStatus` [version]: ignores an acknowledgement whose baseline matches neither the current nor the new version, advances `savedVersionId` only on hydration or an accepted live map, treats `widgetsChanged` as a report change, and resets viewer dirty markers on entering edit.
8. [src/client/reducers/reportReducer.js:19](../src/client/reducers/reportReducer.js#L19) `report` [version]: advances `report.versionId` from the save response under the same baseline guard.
9. [src/client/reducers/widgetsReducer.js:20](../src/client/reducers/widgetsReducer.js#L20) `widgets` [version] [concurrency]: tracks `revision`/`savedRevision`, accepts acknowledgements only for the current lineage, raises `conflict` when an incoming config differs from both the local draft and the saved baseline.

### 2. Dataset removal

Change: the server no longer touches `widgets_config` on removal; the browser reconciles it exactly as Kepler reconciles dropped layers, and the next authored save persists the result.

1. [src/server/dekart/dataset.go:223](../src/server/dekart/dataset.go#L223) `RemoveDataset` [writes] [concurrency]: deletes the dataset and its legacy query in one transaction and leaves both configs untouched.
2. [src/server/dekart/dataset.go:293](../src/server/dekart/dataset.go#L293) `snapshotDatasetRemovalTx` [writes] [version]: rotates `version_id` and records a snapshot, which is what makes a stale concurrent save fail CAS.
3. [src/client/actions/report.js:272](../src/client/actions/report.js#L272) `reportUpdate` [concurrency]: derives `removedDatasetIds` from the stream and cleans each one up before the map config is reconciled, so the removed dataset's layers are already gone.
4. [src/client/actions/dataset.jsx:64](../src/client/actions/dataset.jsx#L64) `cleanupRemovedDataset`: tears down the Kepler dataset and the DuckDB source; widget state is no longer special-cased here.
5. [src/client/widgets/ReportWidgets.jsx:79](../src/client/widgets/ReportWidgets.jsx#L79) `adoptConfig` [writes]: restores canonical config into the live store, drops dashboards whose dataset left the report, and publishes that pruning as an authored change so autosave persists it.
6. [src/client/widgets/widgetsConfig.js:92](../src/client/widgets/widgetsConfig.js#L92) `applyWidgetsConfig`: instantiates a dashboard only when its id is in the report's dataset list, binding on report membership rather than on loaded tables.
7. [src/client/reducers/datasetReducer.js:161](../src/client/reducers/datasetReducer.js#L161) `autoCreateWidgetIds`: clears default eligibility for the removed dataset.

### 3. MCP map configuration update

Change: the agent-facing map write moves from three independent statements to one locked transaction, and it is the only path that rejects references to datasets outside the report.

1. [src/server/dekart/mcp.go:639](../src/server/dekart/mcp.go#L639) `callUpdateReportMapConfigTool` [writes] [auth] [concurrency] [version]: opens a transaction, locks the report, validates inside it, updates `map_config`/`version_id` and creates the snapshot before commit.
2. [src/server/dekart/mapconfigvalidation.go:58](../src/server/dekart/mapconfigvalidation.go#L58) `validateReportMapConfigTx` [concurrency]: reads dataset ids through the caller's transaction, replacing the unlocked `getReportDatasetIDSet` lookup that could race concurrent dataset changes.
3. [src/server/dekart/report.go:339](../src/server/dekart/report.go#L339) `createReportSnapshotWithVersionIDTx` (seen)

### 4. Fork and duplicate report

Change: dataset rebinding stops rewriting raw strings and remaps map and widget bindings structurally.

1. [src/server/dekart/report.go:546](../src/server/dekart/report.go#L546) `commitReportWithDatasets` [writes]: remaps both configs, fails the fork on a remap error, inserts `widgets_config` on the playground and workspace paths.
2. [src/server/dekart/report.go:435](../src/server/dekart/report.go#L435) `updateDatasetIds`: parses `map_config` and returns an error instead of a global `strings.ReplaceAll` that could corrupt labels containing a dataset id.
3. [src/server/dekart/report.go:461](../src/server/dekart/report.go#L461) `remapMapConfigDatasetRefs`: rewrites only layer `dataId`, filter `dataId` in string and array form, and tooltip field maps.
4. [src/server/dekart/widgetsconfig.go:116](../src/server/dekart/widgetsconfig.go#L116) `remapWidgetDatasets` [writes]: validates, then rekeys `dashboardsById` and each dashboard `id` to the new dataset ids.

### 5. History restore

Change: restore carries widget configuration with the map as one revision.

1. [src/server/dekart/report.go:1623](../src/server/dekart/report.go#L1623) `RestoreReportSnapshot` [writes] [version]: loads `widgets_config` from the snapshot row and restores it atomically with map, title, params and readme.

### 6. Report stream hydration and conflict detection

Change: widget state hydrates from the stream, and eligibility queues survive an accepted live map.

1. [src/server/dekart/report.go:55](../src/server/dekart/report.go#L55) `getReportWithOptions`: selects and scans `widgets_config` into every streamed report payload.
2. [src/client/reducers/datasetReducer.js:136](../src/client/reducers/datasetReducer.js#L136) `reportAutoCreateIds`: shared eligibility computation for layers and widgets; it no longer empties the queue when a live map config is accepted.
3. [src/client/reducers/rootReducer.js:143](../src/client/reducers/rootReducer.js#L143) `combineReducers`: registers the `widgets` slice.

### 7. Dataset added to map and default charts

Change: filters survive a source swap, and widget defaults follow the UI-addition lifecycle with their own consumption queue.

1. [src/client/actions/dataset.jsx:209](../src/client/actions/dataset.jsx#L209) `addDatasetToMap`: deep-copies this dataset's filters before the data swap and restores them after the new rows land.
2. [src/client/actions/dataset.jsx:171](../src/client/actions/dataset.jsx#L171) `restoreDatasetFilters`: re-adds a missing filter then applies the saved config; domain validity is reconciled downstream by the widget bridge.
3. [src/client/widgets/ReportWidgets.jsx:137](../src/client/widgets/ReportWidgets.jsx#L137) `prepare` [concurrency]: generation-checked queue that unmounts consumers of the previous revision, recreates the `widgets.*` view, refreshes schemas and clears only cached results.
4. [src/client/widgets/widgetStore.js:80](../src/client/widgets/widgetStore.js#L80) `suggestWidgets`: creates Row count plus eligible category and histogram from field heuristics.
5. [src/client/widgets/ReportWidgets.jsx:32](../src/client/widgets/ReportWidgets.jsx#L32) `ReportWidgets`: owns the report-scoped store, adopts only external configs, re-applies persisted state on entering edit, and publishes authored changes through `widgetsChanged`.
6. [src/client/widgets/ReportWidgets.jsx:19](../src/client/widgets/ReportWidgets.jsx#L19) `restoreWidgetsConfig`: resets every dashboard selection before applying persisted config, so stale clauses cannot survive the swap.
7. [src/client/widgets/ReportWidgets.jsx:79](../src/client/widgets/ReportWidgets.jsx#L79) `adoptConfig` (seen)

### 8. Chart interaction to map presentation

Change: chart selections and native map filters converge on one Mosaic selection, and feedback stays pending until deck.gl paints.

1. [src/client/widgets/useWidgetFilters.js:17](../src/client/widgets/useWidgetFilters.js#L17) `useWidgetFilters`: mirrors native filters into the shared selection as SQL predicates, restores saved selections through the real interactor, reconciles values against the refreshed domain, removes orphaned `widget:` filters.
2. [src/client/lib/nativeFilterPredicate.js:4](../src/client/lib/nativeFilterPredicate.js#L4) `nativeFilterPredicate`: translates select, multiSelect and range into Mosaic SQL and throws an explicit error for unsupported types.
3. [src/client/widgets/widgetStore.js:63](../src/client/widgets/widgetStore.js#L63) `deferWidgetFilter`: shared pending counter routing filter work through the same presentation deferral as direct map changes.
4. [src/client/widgets/widgetStore.js:39](../src/client/widgets/widgetStore.js#L39) `createWidgetStore`: report-local store over the shared DuckDB worker, with `setAutoFreeze(false)` for the app-resolved Immer instance and cancel-safe query execution.
5. [src/client/widgets/widgetsConfig.js:33](../src/client/widgets/widgetsConfig.js#L33) `parseWidgetsConfig`: client-side closed-subset validation mirroring the server schema; unknown shapes throw rather than degrade.
6. [src/client/widgets/widgetsConfig.js:74](../src/client/widgets/widgetsConfig.js#L74) `serializeWidgetsConfig`: strips SQLRooms runtime state and derives `panelOrder` from the layout.
7. [src/client/widgets/widgetsConfig.js:92](../src/client/widgets/widgetsConfig.js#L92) `applyWidgetsConfig` (seen)
8. [src/client/widgets/widgetStore.js:100](../src/client/widgets/widgetStore.js#L100) `fitWidgetPanels`: reconstructs the fixed single-column layout from `panelOrder`.

### 9. Query run gating and mode sync

Change: map settings and chart filtering are inert while queries run, and a refused mode switch returns the URL to edit.

1. [src/client/ReportPage.jsx:570](../src/client/ReportPage.jsx#L570) `syncEditMode`: awaits the toggle and navigates back to the source route when leaving edit was refused, with a mount guard.
2. [src/client/ReportPage.jsx:463](../src/client/ReportPage.jsx#L463) `handleSidePanelInteraction`: swallows side-panel clicks and keys while `interactionDisabled`, instead of marking panel interaction.
3. [src/client/ReportPage.jsx:419](../src/client/ReportPage.jsx#L419) `Kepler`: takes `interactionDisabled` and applies the disabled map-settings class.

## UI

- [src/client/ReportPage.jsx:514](../src/client/ReportPage.jsx#L514) `ReportPage`: passes `queriesRunning` into the filter strip, widget pane and map as the shared reload-pending signal.
- [src/client/widgets/WidgetContents.jsx:13](../src/client/widgets/WidgetContents.jsx#L13) `WidgetContents`: chart stack, saved-count stubs, source headings, inline builder and settings; no missing-source presentation.
- [src/client/widgets/FilterStrip.jsx:9](../src/client/widgets/FilterStrip.jsx#L9) `FilterStrip`: chips with per-filter removal and Clear all, routed through the presentation deferral and disabled during reload.
- [src/client/widgets/CategoryChart.jsx:25](../src/client/widgets/CategoryChart.jsx#L25) `CategoryChart`: readable rows with colors inherited from the matching Kepler layer's scale.
- [src/client/widgets/NumberChart.jsx:80](../src/client/widgets/NumberChart.jsx#L80) `NumberChart`: Dekart-owned aggregate with format, decimals, prefix and suffix settings.
- [src/client/widgets/HistogramChart.jsx:26](../src/client/widgets/HistogramChart.jsx#L26) `HistogramChart`: raw-field intervals and a readable field-name title.
- [src/client/widgets/ChartHeaderActions.jsx:16](../src/client/widgets/ChartHeaderActions.jsx#L16) `ChartHeaderActions`: hover and focus actions with edit and delete in the chart menu.

## Not in plan

src/proto/dekart.pb.go, src/server/dekart/dataset_test.go, src/server/dekart/mcp_test.go, src/server/dekart/snapshot_test.go, src/server/dekart/report_test.go, src/server/dekart/widgetsconfig_test.go, src/client/lib/nativeFilterPredicate.test.js, src/client/ReportPage.module.css, src/client/widgets/*.module.css, src/client/widgets/theme.css
