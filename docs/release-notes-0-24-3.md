# v0.24

These notes cover maintenance updates to `v0.24`.

## ⚠️ Behavior Changes

### MCP mutations now follow report permissions

MCP clients now use the same report permissions as Dekart's UI and gRPC operations. Same-workspace Viewers can read accessible reports, refresh saved queries, and create snapshots, but they can no longer change report structure or content. Admins and Editors can mutate another user's report only when that report allows editing.

If an automation currently authenticates as a Viewer and modifies reports, run it as an Admin or Editor with edit access to the target report.

## ⚙️ Changes Important for Admins

MCP permission failures now preserve the endpoint-specific response. For example, unauthenticated report-property requests return an authentication error, disabled connection creation remains a failed-precondition response, and snapshot export remains available for readable reports in read-only workspaces.

This update introduces no metadata migration or new production environment variables.

## 🔧 User-Facing Bug Fixes

- Saved map layer choices now remain authoritative when reports reload or datasets refresh. Layers that a user removed and saved are no longer recreated for existing warehouse, file, or DuckDB datasets.
- A newly added dataset still receives one inferred layer when its first non-empty result becomes available, including a blank dataset configured later in the same editing session.
- Saved empty layer configurations now apply correctly, and restored DuckDB datasets bind to saved layers without creating duplicates.
- A remotely saved map configuration now applies when Dekart opened the layer panel automatically and the editor did not interact with it. Real remote conflicts are still shown after the editor clicks, types, or otherwise interacts in that panel.

## 🚀 Upgrade Instructions

1. **Back up your metadata database.**

2. **Review MCP automation identities.** Ensure automations that change report titles, map configuration, datasets, queries, files, or README content authenticate as an Admin or Editor and have edit access to the target report.

3. **Upgrade your image:**

   ```
   ghcr.io/dekart-xyz/dekart-premium/dekart:0.24
   ```

   OSS/Docker Hub deployments can use:

   ```
   dekartxyz/dekart:0.24
   ```

No metadata migration is required for this update.
