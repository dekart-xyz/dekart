# CLI Device Auth API Phase 1 Design

## Goal

Add server-side endpoints so `giskill` can:

- authenticate once in browser without callback server
- receive a Dekart API JWT in CLI

This must work for Dekart Cloud and self-hosted, including SSH/headless CLI usage.

## Scope

Phase 1 includes:

- `POST /api/v1/cli/device` (device registration)
- `GET /cli/authorize?device_id=...` (browser authorization page)
- `POST /api/v1/cli/token` (token polling)

## Decisions

- No localhost OAuth callback flow.
- No CLI-side workspace auto-creation.
- Workspace is handled by normal Dekart signup/login flow.
- CLI token is a Dekart-signed JWT.

## Proto-first Landing Strategy

Dekart is gRPC/proto-first, so CLI HTTP endpoints should land as thin adapters around proto-shaped business logic.

### Contract strategy

- define CLI auth request/response models in `proto/dekart.proto`
- keep browser page `/cli/authorize` outside proto (UI flow, not RPC payload)
- keep JSON HTTP payloads aligned with proto messages using `protojson`

### Service boundary

- add a dedicated server service for CLI auth lifecycle (for example `src/server/cli/device_auth.go`)
- service methods should return proto message types
- HTTP handlers in `src/server/app` should only parse input, call service, and encode output

### Handler strategy

- keep explicit `api.HandleFunc` registrations in `src/server/app/app.go`
- move handler implementations to a separate file (for example `src/server/app/cli.go`) to keep `app.go` focused on wiring
- do not duplicate auth/workspace logic in handlers; reuse existing context pipeline

### Reuse existing context flow

- `/cli/authorize` should use the same request context path:
  - `claimsCheck.GetContext(r)`
  - `dekartServer.SetWorkspaceContext(...)`
- authorization succeeds only when claims are resolved and workspace context has a valid workspace id

### Token component

- add a dedicated CLI JWT signer/verifier component (for example `src/server/license/cli_jwt.go` or `src/server/cli/token.go`)
- use same signing infrastructure family as license keys, but separate token semantics
- required claims: `iss`, `aud=dekart-cli`, `email`, `workspace_id`, `exp`
- recommended claims: `iat`, `jti`

## User Flow

```bash
$ giskill dekart init
Opening browser to authorize...
Waiting... Done.
Authenticated as vladi@dekart.xyz
```

1. CLI calls `POST /api/v1/cli/device`.
2. Server returns `device_id`, `auth_url`, `expires_in`.
3. CLI opens browser to `/cli/authorize?device_id=...`.
4. User logs in via normal Dekart auth.
5. If user is new, normal signup flow creates account and workspace.
6. User sees: "Device authorized. You can close this tab."
7. CLI polls `POST /api/v1/cli/token` with `device_id`.
8. Server returns JWT when authorized.

## API Design

### `POST /api/v1/cli/device`

Create a short-lived device auth session.

Request:

```json
{}
```

Response:

```json
{
  "device_id": "dev_3f2c...",
  "auth_url": "https://<host>/cli/authorize?device_id=dev_3f2c...",
  "expires_in": 600,
  "interval": 3
}
```

Behavior:

- create device session with status `pending`
- set expiration (default 10 minutes)
- return polling interval to CLI

Errors:

- `500` device session creation failed

### `GET /cli/authorize?device_id=...`

Authorize device in browser session.

Behavior:

- validate `device_id`
- if device session expired or unknown, show expiration/error page
- if user not logged in, run normal Dekart login flow
- after login, resolve active workspace via normal app logic
- if workspace exists, mark device session `authorized` with `email` + `workspace_id`
- show success page: "Device authorized. You can close this tab."

Errors/pages:

- invalid or expired device
- authenticated but workspace unavailable

### `POST /api/v1/cli/token`

Poll for authorization result.

Request:

```json
{
  "device_id": "dev_3f2c..."
}
```

Response when pending:

```json
{
  "status": "pending",
  "error": "authorization_pending"
}
```

Response when expired:

```json
{
  "status": "expired",
  "error": "expired"
}
```

Response when authorized:

```json
{
  "status": "authorized",
  "token": "<jwt>",
  "expires_in": 2592000,
  "email": "user@example.com",
  "workspace_id": "<uuid>"
}
```

Behavior:

- lookup device session by `device_id`
- if pending, return `authorization_pending`
- if expired, return `expired`
- if authorized, mint JWT and return it
- consume device session after successful token issue (single-use)

## Workspace Handling

No special workspace creation in CLI endpoints.

Rules:

- browser authorization uses normal Dekart session/workspace behavior
- for new users, workspace is created by normal signup flow
- token is not issued until authorization has a valid `workspace_id`

## JWT Model

CLI token is signed by Dekart server key infrastructure (same infra family as license signing, separate audience/use).

Claims:

- `iss`: `dekart.xyz`
- `aud`: `dekart-cli`
- `email`
- `workspace_id`
- `exp`

Recommended additional claims:

- `iat`
- `jti`

Default token TTL:

- 30 days

## Persistence

Add table: `cli_device_sessions`

Fields:

- `device_id` (pk)
- `status` (`pending`, `authorized`, `consumed`, `expired`)
- `email` nullable
- `workspace_id` nullable
- `created_at`
- `expires_at`
- `authorized_at` nullable
- `consumed_at` nullable

Optional table for token revocation/audit:

- `cli_tokens` with `jti`, `email`, `workspace_id`, `expires_at`, `revoked_at`

## Endpoint Wiring

In `src/server/app/app.go` under `/api/v1/`:

- `api.HandleFunc("/cli/device", ...)` methods `POST`, `OPTIONS`
- `api.HandleFunc("/cli/token", ...)` methods `POST`, `OPTIONS`

In static routes:

- `router.HandleFunc("/cli/authorize", staticFilesHandler.ServeIndex)`

## File Layout Proposal

- `proto/dekart.proto`
  - add CLI auth message types and status enum
- `src/server/cli/device_auth.go`
  - device session lifecycle business logic
- `src/server/cli/device_store.go`
  - persistence for `cli_device_sessions`
- `src/server/cli/token.go`
  - CLI JWT issue/validate helpers
- `src/server/app/cli.go`
  - HTTP adapter handlers for `/api/v1/cli/device` and `/api/v1/cli/token`
- `src/server/app/app.go`
  - only route registration (`api.HandleFunc`)

## Security

- short device session TTL (10 minutes)
- polling rate control via `interval`
- token endpoint rate limiting
- consume device session after first successful token issue
- no OAuth warehouse tokens exposed to CLI
- structured logs must never include raw JWTs

## Telemetry

Track:

- `CliDeviceStart`
- `CliDeviceAuthorized`
- `CliDeviceTokenIssued`
- `CliDeviceExpired`

Common fields:

- `is_cloud`
- `workspace_id`
- `error_code` (when failed)

## Testing Plan

### Unit tests

- device session lifecycle: pending -> authorized -> consumed/expired
- token polling states and HTTP statuses
- JWT claims issuance (`email`, `workspace_id`, `exp`, `aud`)

### Integration tests

- authorize device with logged-in user and workspace
- poll token until authorized
- validate JWT with protected test endpoint / middleware

### E2E smoke

- `giskill dekart init` against localhost instance
- browser auth at `/cli/authorize`
- CLI receives JWT and stores it locally

## Deferred to Phase 2

- `POST /api/v1/cli/upload` (GeoJSON upload + report creation)
- map manipulation endpoints from agent/CLI

## Open Questions

- Keep `device_id` only, or add private `device_secret` in polling payload for extra hardening?
- Should CLI JWT TTL be configurable (`DEKART_CLI_TOKEN_TTL_HOURS`)?
