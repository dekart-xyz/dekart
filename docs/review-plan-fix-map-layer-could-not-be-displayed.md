# Review plan: fix-map-layer-could-not-be-displayed

6 files in plan, 1 staged and already reviewed, 12 not in plan. Generated 2026-10-16.

## Contracts

- [src/client/actions/readme.js:5](../src/client/actions/readme.js#L5) `removeReadme`: obsolete re-export removed with explicit user authorization; consumers import the implementation from `actions/report.js`.
- `RemoveReadmeRequest.expected_version_id` (seen, staged).
- `RemoveReadmeResponse.version_id` (seen, staged).

## Workflows, hardest to reverse first

### 1. Remove a README

Change: removal uses its dedicated versioned command and transaction, preserving unrelated unsaved map edits and waiting for canonical content before another save.
Trigger: an author confirms closing the README tab, or an MCP client calls `remove_report_readme`.

1. [src/client/ReportPage.jsx:122](../src/client/ReportPage.jsx#L122) `getOnTabEditHandler` (unchanged): the README-tab close confirmation dispatches `removeReadme()`.
2. [src/client/ReportPage.jsx:25](../src/client/ReportPage.jsx#L25) [+L33](../src/client/ReportPage.jsx#L33) `ReportPage` imports: the tab handler imports `removeReadme` directly from its defining report-actions module.
3. [src/client/actions/report.js:44](../src/client/actions/report.js#L44) `removeReadme` [concurrency]: waits for the previous command, checks navigation, defers stream application and sends the observed report version through `callReportUpdate`.
4. [src/client/actions/report.js:44](../src/client/actions/report.js#L44) `callReportUpdate`: both commands use one Promise/error adapter; map conflicts use streamed conflict messages while removal failures retain generic error reporting.
5. [src/client/actions/grpc.js:34](../src/client/actions/grpc.js#L34) `grpcCall` (unchanged): sends `RemoveReadme(RemoveReadmeRequest)` with `report_id` and `expected_version_id`.
6. [src/server/app/app.go:135](../src/server/app/app.go#L135) `proto.RegisterDekartServer` (unchanged): routes the RPC to the registered server implementation.
7. [src/server/dekart/readme.go:132](../src/server/dekart/readme.go#L132) [+L161](../src/server/dekart/readme.go#L161) [+L169](../src/server/dekart/readme.go#L169) [+L173](../src/server/dekart/readme.go#L173) `Server.RemoveReadme` [auth] [writes] [version]: retains the claims, report permission and workspace gates; starts the transaction, locks the report and validates a supplied version.
8. [src/server/dekart/duckdbcommand.go:37](../src/server/dekart/duckdbcommand.go#L37) `lockReportTx` (unchanged): serializes the command with other writers before its SQL changes.
9. [src/server/dekart/readme.go:161](../src/server/dekart/readme.go#L161) `Server.RemoveReadme` (seen) [writes]: SQL clears `reports.readme` and advances `updated_at` and `version_id` in that transaction.
10. [src/server/dekart/report.go:327](../src/server/dekart/report.go#L327) `createReportSnapshotWithVersionIDTx` (unchanged): inserts the report, dataset and query history and compacts history within the same transaction.
11. [src/server/dekart/readme.go:169](../src/server/dekart/readme.go#L169) `Server.RemoveReadme` (seen): commits, pings report subscribers and returns `RemoveReadmeResponse.version_id`.
12. [src/client/actions/report.js:44](../src/client/actions/report.js#L44) `removeReadme` (seen) [concurrency]: the accepted response releases queued stream messages while keeping later saves blocked.
13. [src/server/report/report.go:82](../src/server/report/report.go#L82) `Streams.Ping` (unchanged): wakes subscribers registered by `GetReportStream`.
14. [src/server/dekart/stream.go:160](../src/server/dekart/stream.go#L160) `GetReportStream` (unchanged): receives the ping and calls `sendReportMessage`.
15. [src/server/dekart/stream.go:22](../src/server/dekart/stream.go#L22) `sendReportMessage` (unchanged): reads canonical report content and sends the full report-stream response.
16. [src/client/actions/report.js:155](../src/client/actions/report.js#L155) `openReport` (unchanged): its `grpcStream` callback dispatches `reportUpdate` for the received report.
17. [src/client/actions/report.js:428](../src/client/actions/report.js#L428) [+L547](../src/client/actions/report.js#L547) `reportUpdate` [concurrency]: dispatches canonical content and initial-layer IDs, then completes only the still-current accepted command.
18. [src/client/reducers/readmeReducer.js:25](../src/client/reducers/readmeReducer.js#L25) `showTab`: removal no longer hides the tab optimistically; the canonical report update controls visibility.
19. [src/client/reducers/readmeReducer.js:37](../src/client/reducers/readmeReducer.js#L37) [+L44](../src/client/reducers/readmeReducer.js#L44) `markdown`: keeps the draft during the command and clears it when the stream confirms absence.
20. [src/client/reducers/reportReducer.js:145](../src/client/reducers/reportReducer.js#L145) `reportStatus`: releases the saving indicator when the canonical version arrives or the command fails.
21. [src/client/ReportPage.jsx:226](../src/client/ReportPage.jsx#L226) `DatasetSection` (unchanged): the canonical README absence removes its tab; the user keeps their other local edits.

22. [src/client/actions/report.js:35](../src/client/actions/report.js#L35) [+L37](../src/client/actions/report.js#L37) `resumeReportUpdates` [concurrency]: after command completion or failure, one cleanup function cancels any remaining canonical-content wait, releases stream processing and clears only the matching current command.

Branch from step 7, version conflict or transaction failure:

1. [src/server/dekart/readme.go:132](../src/server/dekart/readme.go#L132) `Server.RemoveReadme` (seen): returns the error and rolls back; the stored README and history remain intact.
2. [src/client/actions/report.js:44](../src/client/actions/report.js#L44) `removeReadme` (seen): dispatches command failure before the shared cleanup runs.
3. [src/client/reducers/reportReducer.js:145](../src/client/reducers/reportReducer.js#L145) `reportStatus` (seen): clears saving without removing the README draft.
4. [src/client/actions/report.js:35](../src/client/actions/report.js#L35) `resumeReportUpdates` (seen): cancels the remaining completion wait and releases stream processing.

Branch from step 3, navigate away before canonical completion:

1. [src/client/ReportPage.jsx:592](../src/client/ReportPage.jsx#L592) `ReportPage` cleanup (unchanged): dispatches `closeReport`.
2. [src/client/actions/report.js:97](../src/client/actions/report.js#L97) `closeReport`: calls `resumeReportUpdates` for the pending removal before the existing stream/runtime cleanup.

Branch from the external MCP trigger:

1. [src/server/dekart/mcp.go:912](../src/server/dekart/mcp.go#L912) `callRemoveReportReadmeTool` (unchanged): decodes `report_id` and any supplied version, calls `Server.RemoveReadme` from step 7, and returns its response as JSON.
2. `RemoveReadmeRequest` (seen, staged).

### 2. Save metadata while the first map data is loading

Change: pending commands block overlapping saves, and early metadata saves preserve the absence of a saved map configuration until initial data reaches Kepler.
Trigger: the author clicks Save or the autosave timer fires while initial data is pending.

1. [src/client/ReportHeaderButtons.jsx:165](../src/client/ReportHeaderButtons.jsx#L165) `useAutoSave` (unchanged): its timer dispatches `saveMap`; the Save button dispatches the same action.
2. [src/client/actions/report.js:746](../src/client/actions/report.js#L746) [+L750](../src/client/actions/report.js#L750) [+L785](../src/client/actions/report.js#L785) `saveMap` [concurrency]: rejects saves while a command or conflict is unresolved; sends an empty map configuration only when initial auto-created layers are pending and no dataset has reached Kepler.
3. [src/client/actions/grpc.js:34](../src/client/actions/grpc.js#L34) `callReportUpdate` / `grpcCall` (seen): sends `UpdateReport(UpdateReportRequest)` with the observed version, metadata, query changes and preserved map configuration absence.
4. [src/server/dekart/report.go:959](../src/server/dekart/report.go#L959) `Server.UpdateReport` (unchanged) [auth] [version]: checks access, locks the report and validates the observed version.
5. [src/server/dekart/report.go:1032](../src/server/dekart/report.go#L1032) `Server.UpdateReport` (unchanged) [writes]: SQL updates the report and query sources, creates history and commits before returning the new version and pinging the stream.
6. [src/client/actions/report.js:658](../src/client/actions/report.js#L658) `savedReport` (unchanged): constructs the save acknowledgement; `saveMap` dispatches it before calling the shared stream cleanup.
7. [src/client/reducers/reportReducer.js:165](../src/client/reducers/reportReducer.js#L165) `reportStatus` (unchanged): updates the saved baseline and clears saving.
8. [src/client/ReportHeaderButtons.jsx:418](../src/client/ReportHeaderButtons.jsx#L418) `ReportHeaderButtons` (unchanged): renders the saved cloud indicator; later initial data can still receive its default layer.

### 3. Reload before the first map save

Change: initial hydration may infer default layers from existing completed query results when the report has no saved map configuration.
Trigger: the author reloads a report after its query finishes but before the first successful map save.

1. [src/client/ReportPage.jsx:535](../src/client/ReportPage.jsx#L535) `ReportPage` (unchanged): its effect opens the report and subscribes to the canonical stream.
2. [src/client/actions/report.js:155](../src/client/actions/report.js#L155) `openReport` (seen): sends `GetReportStream(ReportStreamRequest)`.
3. [src/server/dekart/stream.go:160](../src/server/dekart/stream.go#L160) `GetReportStream` (seen): the registered subscription reads and sends the canonical report and its query results through `sendReportMessage`.
4. [src/client/actions/report.js:428](../src/client/actions/report.js#L428) `reportUpdate` (seen): passes the canonical map configuration to initial layer selection.
5. [src/client/actions/report.js:217](../src/client/actions/report.js#L217) [+L224](../src/client/actions/report.js#L224) `initialAutoCreateLayerIds`: excludes DuckDB datasets and permits initial layer inference when no saved configuration exists, even if a query result is already complete.
6. [src/client/reducers/datasetReducer.js:135](../src/client/reducers/datasetReducer.js#L135) `reportAutoCreateIds` (unchanged): initializes pending auto-created layer IDs from that initial report update.
7. [src/client/actions/dataset.jsx:402](../src/client/actions/dataset.jsx#L402) `downloadDataset` (unchanged): requests `GET /api/v1/dataset-source/{dataset}/{source}.{extension}` and dispatches `finishDownloading` when the data arrives.
8. [src/server/app/app.go:166](../src/server/app/app.go#L166) dataset-source handler (unchanged): routes the request to `Server.ServeDatasetSource` and returns stored result bytes.
9. [src/client/reducers/datasetReducer.js:76](../src/client/reducers/datasetReducer.js#L76) `downloading` (unchanged): records the downloaded response for publication.
10. [src/client/Downloading.jsx:46](../src/client/Downloading.jsx#L46) `Downloading` (unchanged): its effect dispatches `addDatasetToMap` for ready data.
11. [src/client/actions/dataset.jsx:211](../src/client/actions/dataset.jsx#L211) `addDatasetToMap` (unchanged): publishes data with `autoCreateLayers` from the pending IDs; Kepler displays the inferred layer.

## Not in plan

`cypress/e2e/cloud/queryParameterStream.cy.js`, `cypress/e2e/cloud/reportSaveRegression.cy.js`, `cypress/e2e/pg-s3/missingQueryResultRecovery.cy.js`, `proto/dekart_pb.d.ts`, `proto/dekart_pb.js`, `src/proto/dekart.pb.go`, `src/server/dekart/mcp_test.go`, `src/client/actions/readme.test.js`, `src/server/dekart/readme_test.go`, and the three implementation/refactor/review-plan documents.
