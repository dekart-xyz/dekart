# v0.25

These notes cover maintenance updates to `v0.25`.

## 🔍 Feature Highlights

### Search widget

Reports can now include a **Search** widget for finding values in a text or H3 string field. Selecting one or more values filters the map and other charts, and the selection appears in the report's filter controls. Search widgets are saved with reports and can also be configured through the existing MCP chart tools.

### Map area filters now apply to charts

Charts now follow polygon selections drawn on the map across point, icon, line, arc, H3, text GeoJSON, and supported GeoArrow layers. This keeps chart totals and distributions aligned with the selected area. Native geometry layers are not yet supported for chart polygon filtering.

## ⚠️ Behavior Changes

On Dekart Cloud, client application and stream errors now appear in server error logs with report and workspace identifiers where available. This can trigger existing error-log alerts. Authentication and permission-denied errors remain excluded.

## ⚙️ Changes Important for Admins

The UI now offers a **Report issue** link for errors. No new environment variables or metadata migrations are required.

## 🔧 User-Facing Bug Fixes

- Switching from Viewing back to Editing restores the saved map layers and filters without duplicating or hiding layers, including layers filtered by charts.
- DuckDB CSV sources now accept rows up to 20 MB, including large geometry values. Rows beyond that limit show a concise error.
- Failed upstream DuckDB queries now show their underlying error in dependent queries.
- Dataset publication failures and map rendering errors now show actionable messages instead of leaving users with an unexplained map failure.
- Cancelled downloads and denied location access now appear as warnings instead of application errors.

## 🚀 Upgrade Instructions

1. **Back up your metadata database.**

2. **Upgrade your image:**

   ```
   ghcr.io/dekart-xyz/dekart-premium/dekart:0.25
   ```

   OSS/Docker Hub deployments can use:

   ```
   dekartxyz/dekart:0.25
   ```

No metadata migration is required for this update.
