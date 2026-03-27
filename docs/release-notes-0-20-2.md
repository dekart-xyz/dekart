# v0.20.2

## 🔍 Feature Highlight

### Workspace Switching (Behavior Change)

Users can now switch workspaces directly in the UI via a workspace selector.
This release also improves default workspace creation and display of long workspace names.

### Report Map Previews (Behavior Change)

Report previews are now visible across Home/report lists and are kept up to date as maps are saved.
When a preview is missing, Dekart falls back to map configuration/default center so cards still render meaningfully.

### Public Report Sharing Metadata

Public report pages now include better HTML metadata and page titles for improved link previews.

## 🔧 Fixes & Improvements

- **Report List Reliability**: Fixed report list deadlock and related loading issues.
- **Mobile/Responsive UI**: Improved report/header responsiveness and layout behavior.
- **Runtime Stability**: Prevented server crashes on canceled contexts.

## ⚙️ Environment Variables

No new environment variables were introduced in `v0.20.2`.

## 🚀 Migration Steps

1. **Backup your Postgres database.**

2. **Upgrade your image:**

   ```
   ghcr.io/dekart-xyz/dekart-premium/dekart:0.20.2
   ```

   Migrations are applied automatically at startup.
