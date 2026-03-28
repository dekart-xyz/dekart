# v0.22.0

## 🔍 Feature Highlights

### Map change history and restore

Users can open map change history, review previous versions, and restore an earlier snapshot directly from the UI.
Snapshots now include richer report, dataset, and query state metadata.

### Query auto-refresh controls

Maps can now run queries on an interval in view mode, with refresh controls in the header and query settings.
This makes dashboards easier to keep current without manual reruns.

### Workspace switching in UI

Users can switch between workspaces from a dedicated selector.
Workspace and header flows were updated for better behavior with long names and multi-workspace accounts.

### Map previews across report lists

Home/report cards now show map previews more consistently.
When a preview is missing, Dekart falls back to map configuration defaults so cards still render useful context.

### Public report metadata improvements

Public report pages now include improved HTML metadata and page titles for better link previews and browser tab clarity.

### Location controls on maps

Map controls now include user location actions and improved mobile behavior for map interactions.

### Expanded file upload support

Users can upload `.parquet` files directly, in addition to existing `.csv` and `.geojson` uploads.
Upload validation was also tightened so unsupported or oversized files fail earlier with clearer behavior.

## ⚙️ Changes Important for Admins

### Community Edition mode and license key support

Community Edition mode is now wired into build/runtime flows with license key validation and issuance support.

### OIDC JWT header authentication

Dekart supports OIDC JWT header auth for reverse-proxy setups (for example Keycloak + oauth2-proxy).
This enables SSO-style login flows without Google OAuth redirects.

### Postgres query replay storage

`DEKART_STORAGE=PG` support enables query replay from Postgres storage, reducing dependency on object storage in PG-based deployments.

### Version check configuration

Version-check behavior can now be configured so operators can control upgrade notification behavior per environment.

### Environment variable updates

New variables introduced in this range:

- `DEKART_REQUIRE_OIDC`
- `DEKART_OIDC_JWKS_URL`
- `DEKART_OIDC_ISSUER`
- `DEKART_OIDC_AUDIENCE` (optional)
- `DEKART_VERSION_CHECK_URL`
- `DEKART_VERSION_CHECK_FORCE_CURRENT_VERSION`
- `DEKART_LICENSE_KEY`

Renamed variable:

- `DEKART_POSTGRES_DATA_CONNECTION` -> `DEKART_POSTGRES_DATASOURCE_CONNECTION`

## 🔧 User-Facing Bug Fixes

- Fixed report list deadlock and related loading issues.
- Improved map preview reliability by preventing empty/transparent preview saves.
- Fixed crashes and unstable behavior around canceled-context execution paths.
- Improved dataset/source retrieval and error handling in query/report flows.
- Fixed archived/report list behavior and several navigation/state edge cases.
- Improved responsive behavior for report headers and controls on smaller screens.

## 🚀 Upgrade Instructions

1. **Backup your Postgres database.**

2. **Update environment configuration:**

   - Configure OIDC header-auth variables if you use reverse-proxy SSO.
   - Rename `DEKART_POSTGRES_DATA_CONNECTION` to `DEKART_POSTGRES_DATASOURCE_CONNECTION`.
   - Set `DEKART_LICENSE_KEY` if your deployment mode requires it.
   - Optionally configure version-check variables for your environment.

3. **Upgrade your image:**

   ```
   ghcr.io/dekart-xyz/dekart-premium/dekart:0.22.0
   ```

   OSS/Docker Hub deployments can use:

   ```
   dekartxyz/dekart:0.22.0
   ```

Migrations are applied automatically at startup.
