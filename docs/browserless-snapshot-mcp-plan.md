# Browserless Snapshot MCP Integration Plan

## Goal
Enable agents to request a map screenshot through MCP and receive a short-lived URL that streams a PNG image from Dekart.

## Agreed Decisions
- MCP request only needs `report_id`.
- MCP response returns `snapshot_url` and `expires_in`.
- Snapshot token is opaque UUID, stored in memory only (no DB).
- Snapshot URL shape is fixed: `/snapshot/report/{token}.png`.
- Token TTL is fixed to 2 minutes.
- No extra signing-key configuration for snapshots.
- Browserless URL has default: `https://production-sfo.browserless.io/screenshot`.
- If `DEKART_BROWSERLESS_TOKEN` is not set, snapshot feature is disabled.

## End-to-End Flow
1. Agent calls MCP tool `create_report_snapshot` with `report_id`.
2. Backend validates report access for current user/workspace.
3. Backend creates UUID token with in-memory scope claims (`email`, `workspace_id`, `report_id`) and expiry.
4. Backend returns `/snapshot/report/{token}.png` + `expires_in`.
5. Client requests snapshot URL.
6. Backend validates token and reconstructs auth/workspace context from token claims.
7. Backend calls Browserless and streams image bytes (`image/png`) in HTTP response.
8. Backend deletes token from memory after request handling.

## API / Proto

### RPC
In `proto/dekart.proto`:
- `rpc CreateReportSnapshot(CreateReportSnapshotRequest) returns (CreateReportSnapshotResponse);`

### Request
`CreateReportSnapshotRequest`
- `string report_id = 1;`

### Response
`CreateReportSnapshotResponse`
- `string snapshot_url = 1;`
- `int64 expires_in = 2;`

### Server-Side Fixed Render Defaults
- width: `1600`
- height: `900`
- format: `png`
- include legend: `true`
- device scale factor: `1.0`
- timeout: `30s`

## HTTP Endpoint
- `GET /snapshot/report/{token}.png`
- Behavior:
  - token lookup + TTL validation in memory
  - context reconstruction from stored claims (`email`, `workspace_id`, `report_id`)
  - report access re-check in reconstructed context
  - Browserless capture call
  - stream bytes directly to response (`Content-Type: image/png`)
  - remove token from in-memory store

## Files and Methods

### Backend wiring
- `src/server/app/app.go`
  - route: `GET /snapshot/report/{token}.png` -> `HandleSnapshotReport`

### Dekart server
- `src/server/dekart/snapshot.go`
  - `CreateReportSnapshot(...)`
  - `HandleSnapshotReport(...)`
  - helpers for claims/context/url construction

### Domain package
- `src/server/reportsnapshot/token.go`
  - `IssueToken(claims) (token, expiresAt, error)`
  - `ParseAndValidateToken(token) (claims, error)`
  - `DeleteToken(token)`

- `src/server/reportsnapshot/browserless.go`
  - `CaptureImage(...)`
  - Browserless URL resolution:
    - `DEKART_BROWSERLESS_URL` if set
    - fallback to `https://production-sfo.browserless.io/screenshot`
  - optional token passthrough:
    - `DEKART_BROWSERLESS_TOKEN`

## MCP Tool
- Tool name: `create_report_snapshot`
- Input schema: only `report_id` required
- Dispatcher: MCP call -> `CreateReportSnapshot` RPC

## Security Model
- Opaque token (UUID), no embedded user data in URL.
- Claims live only in process memory.
- No persistence in DB/object storage.
- 2-minute TTL.
- One-use intent by deleting token after request handling.

## Error Contract
- Feature disabled (`DEKART_BROWSERLESS_TOKEN` missing): MCP snapshot tool is hidden and RPC returns `FailedPrecondition`.
- Invalid or expired token: `401`
- Missing report access: gRPC `PermissionDenied` / HTTP `403`
- Missing report: gRPC `NotFound`
- Browserless failure: `502`

## Test Plan
- Unit:
  - token issue/validate/delete and expiry behavior
  - snapshot request validation (`report_id`)
- Integration:
  - `CreateReportSnapshot` returns valid URL + TTL
  - snapshot URL with valid token streams image (mock Browserless)
  - invalid token rejected
