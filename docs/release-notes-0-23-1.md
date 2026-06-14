# v0.23.1

These notes cover changes since `v0.23.0`. This is a patch release that addresses small issues and hardens behavior introduced in `v0.23`.

## ⚙️ Changes Important for Admins

### Report visit analytics

Dekart now records individual report visit events in addition to aggregate counters, giving a more accurate view of report engagement. A new metadata migration (`report_visit_events`) is applied automatically at startup.

## 🔧 User-Facing Bug Fixes

- Fixed MCP query handling of invalid `dataset_id` and `query_id` values by validating IDs before use, preventing internal errors on malformed input.
- `Run All` now skips legacy queries whose data sources are missing instead of failing the whole run.
- MCP no longer deletes the dataset when handling a report README, and local file-upload data now persists correctly across MCP operations.
- BigQuery service-account connection handling is more reliable, including job location and dataset retrieval paths.
- Fixed the Docker image missing the `sqlite` directory, which could break SQLite metadata startup in some builds.

## 🚀 Upgrade Instructions

1. **Backup your metadata database.**

2. **Check your license key.** If your deployment uses `DEKART_LICENSE_KEY`, make sure it is valid before upgrading. With this release an expired key puts the workspace into read-only mode rather than failing outright. [Get a key free here](https://mailchi.mp/dekart/upgrade-to-sso).

3. **Upgrade your image:**

   ```
   ghcr.io/dekart-xyz/dekart-premium/dekart:0.23
   ```

   OSS/Docker Hub deployments can use:

   ```
   dekartxyz/dekart:0.23
   ```

Migrations are applied automatically at startup.
