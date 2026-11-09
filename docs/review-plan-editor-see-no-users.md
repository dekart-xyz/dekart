# Review plan: editor-see-no-users

Provisional: refactor verification stopped because the loaded-layer view-to-edit Cypress test cannot find Query 1 after 120 seconds. Return the failure to `dekart-implement` before completing this pass.

2 files in plan, 0 staged and already reviewed, 6 not in plan. Generated 2026-11-09.

## Contracts

No public function, request, response or schema changed in the uncommitted diff. The existing internal update action now carries the previously saved title.

## Workflows, hardest to reverse first

### 1. Keep an edited map name through incoming updates and save it

Change: Incoming query updates keep a name the user has edited until the save completes.
Trigger: The user edits the map name while a query or dataset update arrives.

1. [src/client/ReportPage.jsx:335](../src/client/ReportPage.jsx#L335) `Title` (unchanged): Enter or leaving the name field dispatches the edited name.
2. [src/client/actions/report.js:666](../src/client/actions/report.js#L666) `reportTitleChange` (unchanged): Sends the name to the client state.
3. [src/client/reducers/reportReducer.js:153](../src/client/reducers/reportReducer.js#L153) `reportStatus` (unchanged): Stores the edited name and the time it changed.
4. [src/client/actions/report.js:169](../src/client/actions/report.js#L169) `openReport` (unchanged): Subscribes to updates for the open map.
5. [src/client/actions/report.js:127](../src/client/actions/report.js#L127) `getReportStream` (unchanged): Builds `ReportStreamRequest` with the map ID and calls `grpcStream`.
6. [src/client/actions/grpc.js:186](../src/client/actions/grpc.js#L186) `getStream` (unchanged): Sends `GetReportStream(ReportStreamRequest)` with the signed-in user's headers and the last received sequence.
7. [src/server/app/app.go:135](../src/server/app/app.go#L135) `RegisterDekartServer` (unchanged): Routes the request to the server.
8. [src/server/dekart/stream.go:164](../src/server/dekart/stream.go#L164) `GetReportStream` [auth] (unchanged): Checks the signed-in user and waits for the map's next update.
9. [src/server/dekart/stream.go:22](../src/server/dekart/stream.go#L22) `sendReportMessage` (unchanged): Reads the map, queries, datasets, files and jobs; returns `ReportStreamResponse`.
10. [src/client/actions/grpc.js:195](../src/client/actions/grpc.js#L195) `getStream.onMessage` (unchanged): Converts the response and calls the subscription callback, which dispatches `reportUpdate`.
11. [src/client/actions/report.js:429](../src/client/actions/report.js#L429) `reportUpdate`: Includes the previously saved name with the incoming report so the reducer can distinguish it from a local edit.
12. [src/client/reducers/reportReducer.js:186](../src/client/reducers/reportReducer.js#L186) [+L199](../src/client/reducers/reportReducer.js#L199) `reportStatus`: Keeps a locally edited name while it is waiting to be saved; otherwise accepts the incoming name.
13. [src/client/ReportPage.jsx:335](../src/client/ReportPage.jsx#L335) `Title` (seen): Displays the retained name.
14. [src/client/ReportHeaderButtons.jsx:166](../src/client/ReportHeaderButtons.jsx#L166) `useAutoSave` (unchanged): After one second, saves when editing is allowed, changes are pending and no save is in progress.
15. [src/client/actions/report.js:757](../src/client/actions/report.js#L757) `saveMap` (unchanged): Copies the retained title and other edited fields into `UpdateReportRequest`.
16. [src/client/actions/report.js:45](../src/client/actions/report.js#L45) `reportCommand` [version] (unchanged): Adds the map ID and expected version; `grpcCall` sends `UpdateReport(UpdateReportRequest)`.
17. [src/server/dekart/report.go:959](../src/server/dekart/report.go#L959) `UpdateReport` [auth] [writes] [version] (unchanged): Checks write permission, starts a transaction, locks the report, checks its expected version and writes the title with the other edited fields.
18. [src/server/dekart/report.go:1115](../src/server/dekart/report.go#L1115) `UpdateReport` (unchanged): Writes a saved copy, commits, notifies report listeners and returns `UpdateReportResponse` with the new version and save time.
19. [src/client/actions/report.js:673](../src/client/actions/report.js#L673) `savedReport` (unchanged): The successful response records the saved version and change time; subsequent report updates follow steps 8–13.

Branch from step 12, no local name edit is pending:
12a. [src/client/reducers/reportReducer.js:199](../src/client/reducers/reportReducer.js#L199) `reportStatus` (seen): Accepts the server's name and displays it through `Title`.

Branch from step 17, another save changed the expected version:
17a. [src/server/dekart/report.go:1033](../src/server/dekart/report.go#L1033) `UpdateReport` (unchanged): Rejects the write before changing rows; `reportCommand` clears the saving state and leaves the edit available.

## Not in plan

src/client/actions/report.test.js, cypress/e2e/cloud/cloudBasicFlowStart.cy.js, cypress/e2e/cloud/queryParameterHelpers.js, cypress/e2e/cloud/sharedWorkspaceEditorAccess.cy.js, docs/refactor-report-editor-see-no-users.md, docs/review-plan-editor-see-no-users.md.
