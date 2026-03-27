# v0.21.0

## 🔍 Feature Highlight

### OIDC Reverse-Proxy Authentication (New)

Dekart now supports OIDC JWT header authentication for reverse-proxy setups (for example, Keycloak + oauth2-proxy).
This enables SSO-style login flows where Dekart validates forwarded JWTs instead of using Google OAuth redirects.

### Postgres Query Replay Storage (New)

A new `DEKART_STORAGE=PG` mode allows query result replay directly from Postgres.
This reduces dependence on object storage for result retrieval and keeps report data access in your Postgres path.

### Better Postgres Datasource UX

The UI now includes Postgres datasource metadata and a Postgres sample query.
Connection and sharing messages are also clearer for datasource combinations where sharing is limited.

## 🔧 Fixes & Improvements

- **Unpublish Safety**: Fixed source-reference checks to prevent accidental object deletion during unpublish flows.
- **Dataset Retrieval Reliability**: Improved dataset source error handling/logging and retrieval branch diagnostics.
- **Postgres Job Stability**: Improved PG job execution flow and row/error handling.


## ⚙️ Environment Variables

New variables:

- `DEKART_REQUIRE_OIDC`
- `DEKART_OIDC_JWKS_URL`
- `DEKART_OIDC_ISSUER`
- `DEKART_OIDC_AUDIENCE` (optional)

Renamed variable:

- `DEKART_POSTGRES_DATA_CONNECTION` → `DEKART_POSTGRES_DATASOURCE_CONNECTION`

  Note: backward-compatible fallback exists, but migrate to the new name to avoid future breakage.

## 🚀 Migration Steps

1. **Backup your Postgres database.**

2. **Update environment configuration:**

   - If adopting OIDC, set `DEKART_REQUIRE_OIDC=1` and configure JWKS/issuer values.
   - Rename `DEKART_POSTGRES_DATA_CONNECTION` to `DEKART_POSTGRES_DATASOURCE_CONNECTION`.
   - If using `DEKART_STORAGE=PG`, unset `DEKART_ALLOW_FILE_UPLOAD` and `DEKART_CLOUD_STORAGE_BUCKET`.

3. **Upgrade your image:**

   ```
   ghcr.io/dekart-xyz/dekart-premium/dekart:0.21.0
   ```

   Migrations are applied automatically at startup.
