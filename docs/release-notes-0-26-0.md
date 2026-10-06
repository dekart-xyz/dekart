# v0.26

These notes cover changes since `v0.25`.

## 🔍 Feature Highlights

### Cross-filter charts across datasets

Category, Search, and Histogram charts can now filter other loaded datasets in the same report. Turn on **Cross-filter** in a chart's settings to apply its selection to datasets with a column of the same name and a compatible type. The settings show which datasets match and which have a different type. The shared filter appears in the report's filter controls.

### Map and chart filters stay in sync

Map filters now update charts as their selections change. Chart selections also update the map and matching charts. Saved map area selections are retained when the report is reopened.

## ⚠️ Behavior Changes

Report history keeps every version for the first 24 hours. For older history, Dekart keeps the latest version per report, author, and hour, and always keeps the current version. The upgrade removes older versions outside that retention rule, so discarded versions can no longer be restored.

## ⚙️ Changes Important for Admins

The report-history migration runs automatically for PostgreSQL and SQLite metadata databases. Dekart also applies the retention rule when new report versions are saved. Back up the metadata database before upgrading if you need to preserve the full existing history.

## 🔧 User-Facing Bug Fixes

- Map and chart filters retain their selections while a dataset refreshes, including DuckDB query results.
- Saving a report while some map layers are still waiting for data preserves those layers and their tooltip settings.
- Restoring a report version rebuilds its saved map layers and filters from the loaded datasets.

## 🚀 Upgrade Instructions

1. **Back up your metadata database**, especially if you need the full existing report history.

2. **Upgrade your image:**

   ```
   ghcr.io/dekart-xyz/dekart-premium/dekart:0.26
   ```

   OSS/Docker Hub deployments can use:

   ```
   dekartxyz/dekart:0.26
   ```

The metadata migration is applied automatically at startup.
