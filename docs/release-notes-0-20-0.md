# v0.20.0

## 🔍 Feature Highlight

### Map Change History with Restore Functionality

View the complete history of changes to your maps and restore any previous version with a single click. Track who made changes and when, with full visibility into modifications to map configurations, datasets, queries, and content. This feature automatically creates snapshots of your maps, allowing you to safely experiment and easily revert to earlier versions when needed.

### Auto Refresh for Queries

Configure automatic refresh intervals for your queries to keep your maps up-to-date with the latest data. Set intervals from 5 minutes to 1 hour, and queries will automatically re-run when the map is in view mode. Auto-refresh pauses in edit mode to prevent interruptions while you're making changes.

### Location Markers

Added user position overlay to display location markers on maps.

## 🔧 Fixes & Improvements

- **Mobile Experience**: Improved responsive layouts for report pages and header buttons, ensuring better usability on mobile devices (map view only).
- **Error Handling**: Enhanced error handling for empty query results, file loading issues, and presigned URL validation

## 🚀 Migration Steps

1. **Backup your Postgres database.**

2. **Upgrade your image:**

   ```
   ghcr.io/dekart-xyz/dekart-premium/dekart:0.20.0
   ```

   Migrations will be applied automatically during startup. No manual intervention required - snapshots will automatically be created for future changes to your maps.

