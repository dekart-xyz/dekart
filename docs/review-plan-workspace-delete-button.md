# Review plan: workspace-delete-button

10 files in plan, 0 staged and already reviewed, 12 not in plan. Generated 2026-10-17.

## Contracts

- [proto/dekart.proto:79](../proto/dekart.proto#L79) [+L1147](../proto/dekart.proto#L1147) `DeleteWorkspace`: new command takes `workspace_id` and returns an empty response; existing RPCs are unchanged.
- [migrations/000055_workspace_deleted_at.up.sql:1](../migrations/000055_workspace_deleted_at.up.sql#L1) `workspaces.deleted_at` [migration]: nullable Postgres deletion timestamp preserves account history.
- [sqlite/migrations/000054_workspace_deleted_at.up.sql:1](../sqlite/migrations/000054_workspace_deleted_at.up.sql#L1) `workspaces.deleted_at` [migration]: matching SQLite timestamp.
- [src/server/notifications/notifications.go:48](../src/server/notifications/notifications.go#L48) `Service.SendWorkspaceDeleteCleanupFailed`: deletion reports include failed storage paths and retained connection names/IDs, without credential values.

## Workflows, hardest to reverse first

### 1. Delete a workspace and remove access

Change: Admin deletion removes workspace content and current memberships transactionally, preserves shared storage and referenced credentials, then reports incomplete cleanup.
Trigger: An admin confirms the exact workspace name in the Delete workspace dialog.

1. [src/client/WorkspacePage.jsx:204](../src/client/WorkspacePage.jsx#L204) `DeleteWorkspaceSection` [billing]: Cloud/admin/default-workspace visibility gates and paid-subscription disablement precede exact-name confirmation; `onOk` dispatches deletion.
2. [src/client/actions/workspace.js:231](../src/client/actions/workspace.js#L231) `deleteWorkspace`: builds `DeleteWorkspaceRequest` with the current workspace ID.
3. [src/client/actions/grpc.js:36](../src/client/actions/grpc.js#L36) `grpcCall` (unchanged): sends gRPC-Web `DeleteWorkspace(DeleteWorkspaceRequest)` with auth and workspace headers.
4. [src/server/app/app.go:373](../src/server/app/app.go#L373) [auth] (unchanged): request claims and workspace context precede the registered gRPC handler.
5. [src/server/dekart/workspacedelete.go:1](../src/server/dekart/workspacedelete.go#L1) `Server.DeleteWorkspace` [auth] [billing] [writes]: requires Cloud/current-workspace admin, rejects default or paid workspaces, opens a SQL transaction and defers rollback.
6. [src/server/dekart/workspacedeleteobjects.go:1](../src/server/dekart/workspacedeleteobjects.go#L1) `collectWorkspaceDeleteObjects`: reads current/historical bindings inside that transaction and excludes storage referenced by surviving reports.
7. [src/server/dekart/workspacedelete.go:1](../src/server/dekart/workspacedelete.go#L1) `DeleteWorkspace` / `deleteWorkspaceRows` / `getRetainedWorkspaceConnections` [writes]: appends removal rows for current members, deletes dependent report/query rows in foreign-key order, retains connections referenced by surviving datasets/history, deletes unshared file rows, stamps `deleted_at`, then commits.
8. [src/server/user/userstreams.go:103](../src/server/user/userstreams.go#L103) `PingAll` (unchanged): wakes online users after commit.
9. [src/server/dekart/workspacedeleteobjects.go:1](../src/server/dekart/workspacedeleteobjects.go#L1) `deleteWorkspaceObjects`: after commit, deletes collected objects without request cancellation and reports failures except already-missing objects.
10. [src/server/notifications/workspacedelete.go:1](../src/server/notifications/workspacedelete.go#L1) `SendWorkspaceDeleteCleanupFailed`: failed objects or retained connections trigger an asynchronous administrator email; HTML is escaped, credential values excluded, existing delivery/error logs preserved.
11. [src/client/actions/workspace.js:46](../src/client/actions/workspace.js#L46) `switchWorkspace` (unchanged): empty `DeleteWorkspaceResponse` clears preferred workspace in session/local storage and reloads `/`.
12. [src/server/dekart/workspace.go:565](../src/server/dekart/workspace.go#L565) `resolveWorkspaceContext` [auth]: scoped tokens no longer regain a workspace after losing membership; normal browser requests select a surviving membership.
13. [src/client/actions/user.js:28](../src/client/actions/user.js#L28) `subscribeUserStream` (unchanged): after page startup, `GetUserStream` calls `sendUserStreamResponse`, receives membership/workspace updates and dispatches `getWorkspace`.
14. [src/client/actions/workspace.js:94](../src/client/actions/workspace.js#L94) `getWorkspace` (unchanged): `GetWorkspace` RPC returns the selected workspace and dispatches `workspaceUpdate`.
15. [src/client/reducers/workspaceReducer.js:14](../src/client/reducers/workspaceReducer.js#L14) `workspace` (unchanged): replaces the selected workspace state; the workspace page renders a surviving workspace or creation form.

Branch from step 5, permission/default/billing rejection:

1. [src/server/dekart/workspacedelete.go:1](../src/server/dekart/workspacedelete.go#L1) `DeleteWorkspace`: returns a typed gRPC error before opening the transaction.
2. [src/client/actions/grpc.js:36](../src/client/actions/grpc.js#L36) `grpcCall` (unchanged): dispatches the error for display and skips the reload callback.

Branch from step 8, another member remains online:

1. [src/server/dekart/stream.go:388](../src/server/dekart/stream.go#L388) `sendUserStreamResponse` (unchanged): refreshes workspace context and sends `GetUserStreamResponse` with current memberships and workspace timestamp.
2. [src/client/actions/user.js:28](../src/client/actions/user.js#L28) `subscribeUserStream` (seen): fetches canonical workspace state and removes the deleted workspace without reloading that member's page.

### 2. Send a workspace invitation

Change: Existing invitation delivery uses the shared private Resend dispatcher with the same payload and error handling.
Trigger: An admin adds an email on the Members tab.

1. [src/client/MembersTab.jsx:53](../src/client/MembersTab.jsx#L53) `MembersTab.addUserCb` (unchanged): dispatches `updateWorkspaceUser` with ADD and selected role.
2. [src/client/actions/workspace.js:149](../src/client/actions/workspace.js#L149) `updateWorkspaceUser` (unchanged): sends `UpdateWorkspaceUser(UpdateWorkspaceUserRequest)` through `grpcCall`.
3. [src/server/dekart/workspace.go:684](../src/server/dekart/workspace.go#L684) `UpdateWorkspaceUser` [auth] [writes] (unchanged): validates admin access, writes the invite log row, refreshes seats and schedules the email; returns an empty response and pings user streams.
4. [src/server/notifications/notifications.go:155](../src/server/notifications/notifications.go#L155) `SendWorkspaceInvite` (unchanged): rejects blank recipients and preserves invite-specific warnings/errors.
5. [src/server/notifications/notifications.go:204](../src/server/notifications/notifications.go#L204) `dispatchWorkspaceInvite`: renders existing templates and forwards the unchanged payload to `dispatchEmail`.
6. [src/server/notifications/notifications.go:266](../src/server/notifications/notifications.go#L266) `dispatchEmail`: POSTs JSON to Resend with existing headers; closes responses, limits rejection-body reads and preserves invalid-recipient classification.
7. [src/client/actions/workspace.js:149](../src/client/actions/workspace.js#L149) `updateWorkspaceUser` (seen): success shows the invitation message; the existing user stream refreshes the Members tab.

### 3. Send a report-sharing email

Change: Existing report-sharing delivery calls the same private Resend dispatcher.
Trigger: A report author adds an email under Invite people in the share dialog.

1. [src/client/ShareButton.jsx:136](../src/client/ShareButton.jsx#L136) `DirectAccess.onChange` (unchanged): dispatches `addReportDirectAccess` with report ID and emails.
2. [src/client/actions/report.js:683](../src/client/actions/report.js#L683) `addReportDirectAccess` (unchanged): sends `AddReportDirectAccess(AddReportDirectAccessRequest)` via `grpcCall`.
3. [src/server/dekart/report.go:1386](../src/server/dekart/report.go#L1386) `AddReportDirectAccess` [auth] [writes] (unchanged): validates write/author access, commits access-log additions/removals, schedules emails and pings the report stream.
4. [src/server/notifications/notifications.go:221](../src/server/notifications/notifications.go#L221) `SendReportAccessGranted` (unchanged): preserves recipient validation and report-specific error logging.
5. [src/server/notifications/notifications.go:266](../src/server/notifications/notifications.go#L266) `dispatchReportAccessGranted`: renders the existing sharing templates and forwards the unchanged payload to `dispatchEmail` (seen), which submits the email to Resend.
6. [src/client/actions/report.js:683](../src/client/actions/report.js#L683) `addReportDirectAccess` (seen): empty success response shows confirmation; the existing report stream reconciles displayed access emails.

## UI

- [src/client/WorkspacePage.jsx:312](../src/client/WorkspacePage.jsx#L312) `WorkspaceTab`: displays deletion only for an existing workspace outside creation/invitation steps.

## Not in plan

Tests (`src/server/dekart/devicetokenworkspace_test.go`, `workspacedelete_test.go`, `src/server/notifications/workspacedelete_test.go`), six generated proto binding files, and three handoff/review Markdown files; ignored feature-driving Cypress spec remains unchanged.
