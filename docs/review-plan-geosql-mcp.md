# Review plan: geosql-mcp

7 files in plan, 0 staged and already reviewed, 4 not in plan. Generated 2026-11-07.

## Contracts

- [src/server/user/claims.go:39](../src/server/user/claims.go#L39) `Claims.DeviceID`: the existing implementation carries the verified device identifier with the user; this refactor changes no fields, signatures, endpoints or response formats.
- [src/server/dekart/mcphttp.go:1](../src/server/dekart/mcphttp.go#L1) `mcpCallRequest`, response types and error types: unchanged declarations now live beside the HTTP handlers.

## Workflows, hardest to reverse first

### 1. Create a settings token as an editor

Change: the existing implementation requires an editor or admin on both the screen and the server; the shared server check now lives with the HTTP handlers.
Trigger: a signed-in user opens Tokens and chooses Create token.

1. [src/client/actions/user.js:28](../src/client/actions/user.js#L28) `subscribeUserStream` (unchanged): requests `GetUserStream` and receives the user's current workspace role.
2. [src/server/dekart/stream.go:445](../src/server/dekart/stream.go#L445) `GetUserStream` and `sendUserStreamResponse` (unchanged): refresh workspace membership and send `GetUserStreamResponse.role` to the browser.
3. [src/client/reducers/userReducer.js:24](../src/client/reducers/userReducer.js#L24) `stream` (unchanged): stores the server's user response after `userStreamUpdate`.
4. [src/client/DeviceTokensTab.jsx:1](../src/client/DeviceTokensTab.jsx#L1) [+L23](../src/client/DeviceTokensTab.jsx#L23) [+L41](../src/client/DeviceTokensTab.jsx#L41) `DeviceTokensTab` [auth]: shows Create token only for admin/editor roles; submitting the dialog dispatches `createDeviceToken` with the chosen name.
5. [src/client/actions/workspace.js:218](../src/client/actions/workspace.js#L218) `createDeviceToken` (unchanged): sends `CreateDeviceTokenRequest.device_name` using `grpcCall`.
6. [src/server/app/app.go:369](../src/server/app/app.go#L369) request handler (unchanged) [auth]: builds the user's claims and current workspace context, then passes the request to the registered gRPC server.
7. [src/server/dekart/device.go:115](../src/server/dekart/device.go#L115) `CreateDeviceToken` [auth] [writes]: validates the user/workspace, calls `requireMCPEditor`, signs a token, and inserts its consumed session into `device_auth_log`.
8. [src/server/dekart/mcphttp.go:1](../src/server/dekart/mcphttp.go#L1) `requireMCPEditor` [auth]: rejects missing identity and roles other than admin/editor, without blocking discovery for subscription restrictions.
9. [src/server/dekart/device.go:110](../src/server/dekart/device.go#L110) creation response (unchanged): reads the canonical token list, notifies the user's stream, and returns the full token once.
10. [src/client/actions/workspace.js:208](../src/client/actions/workspace.js#L208) `getDeviceTokens` (unchanged): requests `ListDeviceTokens`; the server reads the user's active workspace sessions and returns their names, previews and dates.
11. [src/client/reducers/deviceTokensReducer.js:8](../src/client/reducers/deviceTokensReducer.js#L8) `deviceTokens` (unchanged): stores the list on `deviceTokensUpdate`; the creation callback opens the one-time token display in `DeviceTokensTab`.

Branch from steps 4 and 8, viewer or unspecified role:

1. [src/client/DeviceTokensTab.jsx:41](../src/client/DeviceTokensTab.jsx#L41) `DeviceTokensTab` (seen): omits Create token.
2. [src/server/dekart/mcphttp.go:1](../src/server/dekart/mcphttp.go#L1) `requireMCPEditor` (seen) [auth]: denies a direct creation request before any token is signed or stored.

### 2. Call an agent tool and record its device

Change: the existing implementation checks current membership and records the calling device; HTTP handling is separated from execution without changing either.
Trigger: an external client sends `POST /api/v1/mcp/call` with a device token.

1. [src/server/app/app.go:369](../src/server/app/app.go#L369) request handler (unchanged) [auth]: calls `ClaimsCheck.GetContext`, then `SetWorkspaceContext` before routing the request.
2. [src/server/user/claims.go:281](../src/server/user/claims.go#L281) `GetContext` and `validateGoogleOrDeviceAuthToken` (unchanged): route the bearer token to device-token validation.
3. [src/server/user/devicejwt.go:87](../src/server/user/devicejwt.go#L87) `validateDeviceAuthToken` [auth]: verifies the signature and current consumed session, then carries its device identifier into the user's claims.
4. [src/server/dekart/workspace.go:414](../src/server/dekart/workspace.go#L414) `SetWorkspaceContext` (unchanged) [auth]: loads the token's workspace and current membership role from the database on this request.
5. [src/server/app/app.go:216](../src/server/app/app.go#L216) `/mcp/call` route (unchanged): passes the request to `HandleMCPCall`.
6. [src/server/dekart/mcphttp.go:1](../src/server/dekart/mcphttp.go#L1) `HandleMCPCall` [auth]: calls the shared role check, rejects old CLI versions when applicable, and uses `decodeJSONBody` to read the tool name and arguments.
7. [src/server/dekart/mcphttp.go:1](../src/server/dekart/mcphttp.go#L1) call tracking [writes]: passes only the verified device identifier and tool name to `TrackEvent` before executing the tool.
8. [src/server/dekart/track.go:21](../src/server/dekart/track.go#L21) `TrackEvent` (unchanged) [writes]: inserts the Cloud user's email, workspace and event data into `track_events`; self-hosted calls return without a write.
9. [src/server/dekart/mcp.go:34](../src/server/dekart/mcp.go#L34) `callMCPTool`: retains the existing tool-name dispatch and execution bodies; HTTP declarations and tool descriptions have moved out of this file.
10. [src/server/dekart/mcphttp.go:1](../src/server/dekart/mcphttp.go#L1) `writeJSON`: returns the successful tool result with the same JSON format and status.

Branch from step 6, missing identity or denied membership:

1. [src/server/dekart/mcphttp.go:1](../src/server/dekart/mcphttp.go#L1) `requireMCPEditor` (seen) [auth]: rejects the request before tracking or execution, including a still-valid token whose owner was demoted.
2. [src/server/dekart/mcphttp.go:1](../src/server/dekart/mcphttp.go#L1) `writeMCPCallError`: preserves validation details, credential guidance, upload errors and gRPC-to-HTTP status mapping.

Branch from step 9, tool failure:

1. [src/server/dekart/mcphttp.go:1](../src/server/dekart/mcphttp.go#L1) `newMCPGoogleCredentialError` and `mcpCredentialError.Error`: retain the existing credential-specific status, message and next step when a tool requires Google access.
2. [src/server/dekart/mcphttp.go:1](../src/server/dekart/mcphttp.go#L1) `writeMCPCallError` (seen): returns the existing failure response; the already-recorded usage event remains.

### 3. Discover available agent tools

Change: tool descriptions and input normalization live together in `mcptools.go`; discovery and its subscription behavior are unchanged.
Trigger: an external client sends `GET /api/v1/mcp/tools`.

1. [src/server/app/app.go:209](../src/server/app/app.go#L209) `/mcp/tools` route (unchanged): receives the authenticated workspace context from the common request handler and calls `HandleMCPTools`.
2. [src/server/dekart/mcphttp.go:1](../src/server/dekart/mcphttp.go#L1) `HandleMCPTools` [auth]: uses `requireMCPEditor` (seen), then requests the tool definitions even when an editor's trial has not started.
3. [src/server/dekart/mcptools.go:1](../src/server/dekart/mcptools.go#L1) `mcpToolDefinitions`, `normalizeMCPTools` and `normalizeMCPTool`: combine existing definitions with upload tools, normalize each input schema, and produce required fields and minimal examples without changing any tool metadata.
4. [src/server/dekart/mcphttp.go:1](../src/server/dekart/mcphttp.go#L1) `writeJSON` (seen): sends the normalized tool list to the caller; denied roles receive `writeMCPCallError` (seen).

### 4. Create a report, dataset or file over HTTP

Change: the three existing HTTP wrappers move beside the other HTTP handlers, with the same requests, server calls and responses.
Trigger: an external client posts to `/api/v1/reports`, `/api/v1/datasets` or `/api/v1/files`.

1. [src/server/app/app.go:188](../src/server/app/app.go#L188) report/dataset/file routes (unchanged): use the common authenticated request context and select the matching wrapper.
2. [src/server/dekart/mcphttp.go:1](../src/server/dekart/mcphttp.go#L1) `HandleCreateReport`, `HandleCreateDataset` or `HandleCreateFile`: read the matching protobuf request using `readProtoJSON`, call the existing server method, and return its response using `writeProtoJSON`.
3. [src/server/dekart/report.go:242](../src/server/dekart/report.go#L242) `CreateReport`, [src/server/dekart/dataset.go:345](../src/server/dekart/dataset.go#L345) `CreateDataset`, or [src/server/dekart/file.go:272](../src/server/dekart/file.go#L272) `CreateFile` (unchanged) [writes]: apply their existing permission checks and database/storage operations before returning to the wrapper.
4. [src/server/dekart/mcphttp.go:1](../src/server/dekart/mcphttp.go#L1) HTTP wrappers (seen): return the existing success response or pass the server error to `writeGrpcErrorAsHTTP` without altering the status.

## Not in plan

`docs/implement-report-geosql-mcp.md`, `docs/refactor-report-geosql-mcp.md`, `src/server/dekart/createdevicetoken_test.go`, `src/server/dekart/mcpaccess_test.go`; ignored Cypress feature specs and this generated review aid remain outside the Git review scope.
