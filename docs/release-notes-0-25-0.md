# v0.25

These notes cover changes since the final `v0.24` patch release (`v0.24.3`).

## 🔍 Feature Highlights

### Charts next to your map

Reports now have a **Charts** panel. Add charts on top of any dataset in the report and keep them saved with the map:

- **Number**: a single KPI (count, distinct, sum, avg, min, max, median) with optional format, decimals, prefix, suffix, and subtitle.
- **Count plot**: bar chart of category counts with sort order and max bars.
- **Histogram**: distribution of a numeric field with configurable bins.

Charts run in the browser on DuckDB, so they work with warehouse results, uploaded files, and DuckDB datasets alike. Chart selections and map filters stay in sync: selecting bars or a histogram range filters the map, and existing map filters apply to the charts. Charts can be added, edited, reordered by drag and drop, and deleted, and they are included in report snapshots, version history, and forks.

### Charts over MCP

AI agents connected through MCP can now build charts:

- `get_widgets_config_schema` returns the chart config JSON schema.
- `update_report_widgets_config` replaces a report's charts (validated, snapshotted, and applied atomically).
- `get_report_properties` now returns `widgets_config`.
- Snapshots accept `include_widgets` to render charts alongside the map for verification.

## ⚙️ Changes Important for Admins

### Metadata migration

Migration `000052_widgets` adds a nullable `widgets_config` column to `reports` and `report_snapshots`. It is applied automatically at startup. Existing reports are unaffected and simply have no charts.

### Dekart Cloud plans and trial

Dekart Cloud replaces the 3-map limit on Personal workspaces with a 14-day trial. Personal workspaces start the trial from a dedicated page (`/workspace/trial`) and are read-only until then. Plans are now Grow and Max; the Team plan is marked deprecated but remains usable by existing subscribers. Self-hosted deployments are not affected.

## 🔧 User-Facing Bug Fixes

- Removing a dataset now creates a new report revision, so version history and restore stay consistent.
- Map config validation now runs against locked report state, preventing races with concurrent dataset changes.
- Improved error handling when the server is unavailable while saving a report.

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

Migrations are applied automatically at startup.
