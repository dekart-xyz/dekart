# v0.24

These notes cover changes since the final `v0.23` patch release.

## 🔍 Feature Highlights

### Join report data with DuckDB

Dekart can now run DuckDB SQL directly in the browser. DuckDB queries can combine uploaded CSV, GeoJSON, and Parquet files with warehouse query results and other DuckDB datasets in the same report, then send the result directly to the map. No separate DuckDB server or connection is required.

### GitHub-flavored Markdown tables

Report README previews now render GitHub-flavored Markdown tables, including alignment and horizontal scrolling for wide tables.

## ⚙️ Changes Important for Admins

### Cloud Postgres requires encrypted public endpoints

Dekart Cloud requires `sslmode=require` for user-created Postgres connections and rejects hosts that resolve to unspecified, private, loopback, link-local, or multicast addresses. Existing Cloud Postgres records without an SSL mode are treated as requiring TLS.

Self-hosted Postgres connections remain backward compatible: they default to disabled SSL and can use either `disable` or `require` to match the database server.

### Version checks include an anonymous instance ID

When version checks are enabled, self-hosted Dekart now sends a persistent anonymous instance UUID with the existing version-check request. Disabling version checks continues to suppress the request, and CI identities are excluded from ingestion.

## 🔧 User-Facing Bug Fixes

- Fixed Dekart Cloud Postgres queries to use a validated resolved address instead of the raw hostname.
- Fixed Postgres replay storage when Dekart metadata is stored in SQLite by correctly parsing SQLite timestamps.

## 🚀 Upgrade Instructions

1. **Back up your metadata database.**

2. **Review Cloud Postgres connections.** Ensure the target database accepts TLS, its hostname does not resolve to an unspecified, private, loopback, link-local, or multicast address, and Dekart Cloud egress is allowlisted. Retest and save an existing connection if prompted.

3. **Upgrade your image:**

   ```
   ghcr.io/dekart-xyz/dekart-premium/dekart:0.24
   ```

   OSS/Docker Hub deployments can use:

   ```
   dekartxyz/dekart:0.24
   ```

Migrations are applied automatically at startup.
