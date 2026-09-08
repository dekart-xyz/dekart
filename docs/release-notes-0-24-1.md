# v0.24

These notes cover maintenance updates to `v0.24`.

## 🔍 Feature Highlights

### Use OAuth-based BigQuery connections from MCP

MCP clients can now run queries through BigQuery connections that use each user's Google authorization instead of a stored service-account key. With a compatible Dekart CLI, this works across connection discovery, query execution, result retrieval, and report snapshots.

Dekart validates the delegated Google account and required Cloud scope, and returns actionable setup or reauthentication guidance when credentials cannot be used.

### Create additional self-hosted workspaces

Authenticated self-hosted users permitted by the workspace policy can now create an additional workspace from the workspace selector and switch to it immediately. The user configured by `DEKART_DEFAULT_WORKSPACE_ADMIN` can create additional workspaces without enabling workspace creation for every authenticated user.

## ⚠️ Behavior Changes

### Self-hosted workspace creation is now identity-aware

`DEKART_ALLOW_WORKSPACE_CREATION` permits additional workspace creation for authenticated users. Anonymous and auth-disabled sessions continue to use the default workspace and cannot create additional workspaces, even when this flag is set.

The user configured by `DEKART_DEFAULT_WORKSPACE_ADMIN` can create additional workspaces while the general flag remains unset.

### OAuth-based BigQuery connections are available to MCP

BigQuery connections without a stored service-account key now appear in MCP connection discovery. Operations against these connections require delegated Google credentials from a compatible Dekart CLI.

## ⚙️ Changes Important for Admins

Sensitive Google credentials used for private BigQuery snapshots are held only in in-memory snapshot-token state until the token expires. Snapshot dataset access is constrained to the token's report, dataset, and source.

This update introduces no metadata migration or new production environment variables.

## 🔧 User-Facing Bug Fixes

- Fixed GeoJSON uploads from MCP and CLI clients that identify files as `application/octet-stream`. Dekart now infers supported file types from the filename.
- Snapshot render pages now use saved query results without opening browser OAuth prompts or triggering automatic warehouse refreshes.
- Device-token management now refreshes reliably when events share timestamps, excludes expired pending authorizations, and handles revocation deterministically.

## 🚀 Upgrade Instructions

1. **Back up your metadata database.**

2. **Update Dekart CLI if agents use OAuth-based BigQuery connections.** Install a version that supports BigQuery passthrough, run `dekart init`, and follow the gcloud setup prompts. For authenticated deployments, use the same Google user account for gcloud and Dekart. Service-account principals are not supported for passthrough.

3. **Review self-hosted workspace policy.** `DEKART_ALLOW_WORKSPACE_CREATION` enables additional workspaces for authenticated users. `DEKART_DEFAULT_WORKSPACE_ADMIN` enables them only for the configured default admin when the general flag is unset.

4. **Upgrade your image:**

   ```
   ghcr.io/dekart-xyz/dekart-premium/dekart:0.24
   ```

   OSS/Docker Hub deployments can use:

   ```
   dekartxyz/dekart:0.24
   ```

No metadata migration is required for this update.
