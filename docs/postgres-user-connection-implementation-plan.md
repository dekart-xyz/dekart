# Postgres User Connection UX Implementation Plan

## Goal
Enable user-defined PostgreSQL connections in Dekart with UX parity to Snowflake/Wherobots connection flows.

Requirements from product:
- Available for user-defined connections
- Disabled in Dekart Cloud
- Fields in UI:
  - Connection name
  - Server
  - Username
  - Password
  - Database
  - Port

## Scope
In scope:
- Connection type selector and connection modal UX
- Client create/update/test payload wiring
- Proto contract extension for Postgres credentials
- DB schema changes for storing encrypted Postgres credentials
- Server-side create/update/list/get/test handling
- Cloud gating (frontend and backend)

Out of scope:
- SSL/TLS advanced options (sslmode, certs)
- SSH tunnel support
- Connection pool tuning UX

## Current State (as of 2026-05-29)
- `CONNECTION_TYPE_POSTGRES` already exists in proto enum.
- Postgres metadata exists in client datasource registry (`getDatasourceMeta`).
- No user Postgres connection fields exist in `Connection` proto message.
- `ConnectionModal` supports BigQuery/Snowflake/Wherobots only.
- `actions/connection.js` save/test supports BigQuery/Snowflake/Wherobots only.
- Backend `ValidateReqConnection` validates Snowflake/Wherobots only.
- Backend `CreateConnection`/`UpdateConnection` SQL persists BigQuery/Snowflake/Wherobots columns only.
- `userjob.Store.TestConnection` routes Snowflake/Wherobots explicitly and defaults to BigQuery test flow.
- In Cloud, selector currently opens “Other connectors” interest modal, not real Postgres setup.

## UX and Behavior
- Self-hosted (non-cloud): show a Postgres connection card in `CreateConnection`.
- Cloud: do not show a Postgres connect path.
- Modal behaves like Snowflake/Wherobots:
  - `Test Connection` required before `Save` for new/changed secret.
  - Existing password shown as masked placeholder; only re-encrypted if changed.
- Validation messages should be explicit (`postgres_host is required`, etc.).

## Proto Changes
Source of truth: `proto/dekart.proto`.

### `Connection` message fields to add
- `string postgres_host = <new_tag>`
- `string postgres_username = <new_tag>`
- `Secret postgres_password = <new_tag>`
- `string postgres_database = <new_tag>`
- `int32 postgres_port = <new_tag>`

Notes:
- Keep existing field numbers unchanged.
- Use new unique tags appended after current highest tag (`21`).
- Do not manually edit generated files under `proto/*_pb.*`; run `make proto`.

Generated artifacts expected to change after `make proto`:
- `proto/dekart_pb.js`
- `proto/dekart_pb.d.ts`
- `proto/dekart_pb_service.js` (only if service signatures changed; likely no changes)
- `proto/dekart_pb_service.d.ts` (same note)

## Database and Migration Changes
Add a new migration:
- `migrations/0000xx_postgres_user_connection.up.sql`
- `migrations/0000xx_postgres_user_connection.down.sql`

### Columns to add in `connections`
- `postgres_host text NULL`
- `postgres_username text NULL`
- `postgres_password_encrypted text NULL`
- `postgres_database text NULL`
- `postgres_port integer NULL`

## Backend Changes

### 1) Validation
File: `src/server/conn/connctx.go`

Method changed:
- `ValidateReqConnection(con *proto.Connection) error`

Add branch for `CONNECTION_TYPE_POSTGRES` to require:
- `connection_name`
- `postgres_host`
- `postgres_username`
- `postgres_password` (for create and test; update can allow unchanged password if not sent)
- `postgres_database`
- `postgres_port` (>0)

### 2) Connection CRUD persistence
File: `src/server/dekart/connection.go`

Methods changed:
- `getConnection(...)`
  - Extend SELECT list, scan vars, and proto mapping for Postgres fields.
- `getUserConnections(...)`
  - Extend SELECT list, scan vars, and proto mapping for Postgres fields.
- `CreateConnection(...)`
  - Extend INSERT column list/values.
  - Encrypt `postgres_password` via existing `secrets.SecretToServerEncrypted`.
  - Add cloud gate: if `DEKART_CLOUD != ""` and type is Postgres, return permission denied or invalid argument.
- `UpdateConnection(...)`
  - Add Postgres-specific update branch.
  - Update non-secret fields directly.
  - Update encrypted password only when provided/changed.

### 3) Test connection routing
File: `src/server/userjob/userjob.go`

Method changed:
- `TestConnection(ctx, req)`

Add branch:
- `CONNECTION_TYPE_POSTGRES` -> `pgjob.TestConnection(ctx, req)`

### 4) Postgres test implementation
File: `src/server/pgjob/pgjob.go`

Methods to add:
- `func TestConnection(ctx context.Context, req *proto.TestConnectionRequest) (*proto.TestConnectionResponse, error)`
- small helper for DSN construction from connection payload

Behavior:
- Build DSN from request connection fields (host, port, db, user, decrypted password).
- `db.PingContext` with timeout.
- Return `{success:false,error:"..."}` on connectivity/auth/db errors.

Note:
- Existing `pgjob.Store` currently uses env DSN (`DEKART_POSTGRES_DATASOURCE_CONNECTION`) for query runtime. For true user-defined Postgres query execution, follow-up refactor is needed so job creation uses per-connection DSN from `connCtx`. This plan focuses on connection UX + test/create/update correctness.

### 5) MCP secret sanitization
File: `src/server/dekart/mcp.go`

Method changed:
- `sanitizeConnectionForMCP(connection *proto.Connection) *proto.Connection`

Add:
- `sanitized.PostgresPassword = nil`

## Frontend Changes

### 1) Connection type selector
File: `src/client/CreateConnection.jsx`

Changes:
- Add Postgres card in `connectionCards` for non-cloud mode.
- Postgres card click: `dispatch(newConnection(ConnectionType.CONNECTION_TYPE_POSTGRES))`.
- Keep Cloud behavior: no Postgres card.

### 2) Postgres modal UI
File: `src/client/ConnectionModal.jsx`

Methods/components to add/change:
- Add `PostgresConnectionModal({ form })` component.
- Add `CONNECTION_TYPE_POSTGRES` case in switch.
- Add form fields:
  - `connectionName`
  - `postgresHost`
  - `postgresUsername`
  - `postgresPassword`
  - `postgresDatabase`
  - `postgresPort`
- Implement placeholder password behavior similar to Snowflake/Wherobots.
- Track `datasetUsed` warning consistency with other connection types.
- `Footer` `testDisabled` behavior for Postgres should mirror Snowflake logic (test required when secret changed/new).

### 3) Client action payload wiring
File: `src/client/actions/connection.js`

Methods changed:
- `saveConnection(id, connectionType, connectionProps)`
  - Create path: map Postgres fields + encrypt password into `Secret`.
  - Update path: update password only if changed from placeholder.
- `testConnection(connectionType, values)`
  - Build Postgres connection payload + encrypted secret.
- `getConnectionsList()`
  - Mask `postgresPassword` placeholder length similar to Snowflake key handling.

### 4) Optional copy updates
Files likely affected:
- `src/client/Dataset.jsx` subtitle mentioning supported connectors
- `src/client/WorkspacePage.jsx` marketing copy for instant connectors

These are non-blocking but recommended for consistency.

## API/Contract Compatibility
- Existing connection types remain unchanged.
- New Postgres fields are additive in proto and DB schema.
- No RPC method additions required.

## Tests

### Backend
- `src/server/conn/connctx_test.go` (new or extend): Postgres validation required fields.
- `src/server/dekart/connection_test.go`: create/update/list round-trip for Postgres fields and secret behavior.
- `src/server/userjob/userjob_test.go`: Postgres test routing.
- `src/server/pgjob/pgjob_test.go`: `TestConnection` success/failure cases (auth failure, host unreachable, invalid port).
- `src/server/dekart/mcp_test.go`: Postgres password is stripped in sanitize path.

### Frontend
- `src/client/actions/connection.test.js` (or existing test file): Postgres save/test payload and secret-change behavior.
- `src/client/ConnectionModal` tests for required fields and modal switching (if current test harness exists).

## Rollout
1. Add proto fields + migration.
2. Implement backend create/update/list/get/test and MCP sanitization.
3. Implement frontend selector + modal + action wiring.
4. Run `make proto` and full verification.
5. Keep Postgres card hidden in cloud.

## Verification Checklist
- Self-hosted: Postgres card visible and opens modal.
- Cloud: Postgres card not visible; direct API create for Postgres blocked server-side.
- Test Connection works with valid credentials and fails with clear error text.
- Save works after test.
- Editing existing Postgres connection keeps password unless changed.
- Connection appears in list with Postgres icon/meta.
- MCP responses never include `postgres_password`.
