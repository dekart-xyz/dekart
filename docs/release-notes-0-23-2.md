# v0.23.2

These notes cover changes since `v0.23.1`. This is a patch release that hardens the `v0.23` self-hosted, agent, and Cloud workflows.

## ⚙️ Changes Important for Admins

### SQLite backup stability

SQLite backups now skip uploads when the database has not changed, reducing runaway backup creation for self-hosted deployments that use object storage or Snowflake stage backups. Backup pruning is also rate-limited and capped per run.

Snowflake Native App SQLite backups keep the root-stage object layout used by existing installs, and restore/prune logic now handles relative application-stage object names.

### Local development and Cypress auth

Local test identity now uses `DEKART_DEV_CLAIMS=1` plus the `X-Dekart-Claim-Email` header/cookie path. The previous development refresh-token shortcut was removed from the server path and replaced with Cypress-side OAuth stubbing instructions.

The Cypress setup documentation now clarifies how to run local Postgres, backend, frontend, env files, Google OAuth token scopes, and `ELECTRON_RUN_AS_NODE` locally.

## 🔍 Feature Highlights

### Snapshot viewport overrides for agents

MCP report snapshots now accept optional `zoom`, `lat`, and `lon` values, so agents can request a snapshot from a specific camera position without permanently changing the saved map. Snapshot readiness now waits for the expected map state, which makes image capture more reliable when dataset sources load slowly.

### Simpler free-workspace map limit

Free workspaces now use a 3-map creation limit instead of a public-map publishing limit. The upgrade modal and plan copy were simplified around "unlimited maps", with trial start kept as a user-initiated UI action.

MCP now returns a structured map-limit response that tells the agent to send the user to the Dekart UI instead of starting a trial programmatically.

## 🔧 User-Facing Bug Fixes

- Fixed a cloud save race where remote report updates could overwrite local map state while a save was in progress.
- Fixed report forking when shared reports contain empty query parameters.
- Fixed GeoJSON reloads after renaming a dataset label without a file extension.
- Fixed Snowflake SQLite fork Cypress coverage to use the correct test path.
- Improved local and cloud E2E coverage for Google OAuth, report saving, free-workspace limits, file uploads, snapshot rendering, and Snowflake restore paths.

## 🚀 Upgrade Instructions

1. **Backup your metadata database.**

2. **Review local development env vars if you run Cypress or manual dev auth.** Use `DEKART_DEV_CLAIMS=1` for local dev claims. Use `DEV_REFRESH_TOKEN` and `DEV_REFRESH_TOKEN_INFO` only as Cypress-side test inputs.

3. **Upgrade your image:**

   ```
   ghcr.io/dekart-xyz/dekart-premium/dekart:0.23
   ```

   OSS/Docker Hub deployments can use:

   ```
   dekartxyz/dekart:0.23
   ```

Migrations are applied automatically at startup.
