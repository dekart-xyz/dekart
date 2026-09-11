# Integrated Dekart widgets prototype

This prototype runs inside normal Dekart reports. Start `make client` and `make server .env.local`, then open http://localhost:3010. This checkout uses backend port 8090. The former standalone widgets.html entry has been removed.

## Try it

1. Create a report. Upload a CSV/GeoJSON/Parquet file, run a connected warehouse query, or create a DuckDB query using the existing Data editor.
2. Open **Widgets**. The first suitable dataset gets a category chart and histogram inferred from its fields. Choose a different loaded report dataset using the dataset selector.
3. Click categories or brush histogram ranges. Kepler and the other widgets filter together. Native Kepler filters also affect widgets; use **Map** to edit layers and filters.
4. Use **Add widget** or panel settings to open SQLRooms' upstream forms. Rename, configure, reorder, resize and remove panels. Removing all panels keeps the dashboard empty after reload. Suggestions are explicit after initialization.
5. Save with Dekart's normal save control (or autosave). Switch to Viewing to explore without saving those exploratory filters. Reload restores authored defaults. Click Widgets again to collapse its region.
6. Duplicate the report or restore it through History. Both map and widget configuration travel with the report; duplication remaps dataset bindings.

## Integration

- `widgets_config` is a separate nullable column on reports and report snapshots, with PostgreSQL and SQLite migrations. Existing report gRPC responses and updates carry it. Map and widgets share a report revision, transaction and history entry.
- Version-aware saves reject stale writes. Omitted widget config preserves the saved value. The existing report permissions and workspace write gates also govern widget editing.
- SQLRooms 0.29.0 supplies chart creation, settings, rendering and panel layout. Category and histogram are supported; matching-row count is a fixed summary. There is no custom chart builder or editable KPI/formula builder.
- Widgets use derived views over Dekart's actual file/warehouse/DuckDB result tables in the existing browser DuckDB worker. Refresh replaces views and invalidates chart queries. Running/failed queries show a pending/error state.
- Native Kepler filters are evaluated by Kepler on the loaded rows, then applied as row membership to Mosaic. Widget selections mirror into stable, widget-owned Kepler filters. Saved defaults are restored from those filters.
- Viewer exploration stays local to the session; authored changes persist through the backend, not localStorage.

## Prototype boundaries

MCP authoring and code review are excluded. No deployment, commit or push is performed. This is a functional UX reference, not a claim that all release acceptance criteria have been completed.

Count, category and histogram are available. Time series, viewport filtering, arbitrary formulas, cross-dataset joins from widget clicks and full-dashboard image export are not included. Existing map image exports remain map-only. The small-screen UI stacks map and widgets.

The category click adapter imports a pinned upstream internal spec helper. React 18 retains Dekart's existing root lifecycle; moving to concurrent rendering needs separate handling of report/Kepler initialization. Dependency/bundle optimization, exhaustive filter-type and large-data performance coverage remain clean-implementation work.

## Verification

Run `make cypress-run ENV_FILE=.env.local SPEC=cypress/e2e/local/widgets.cy.js` with the app running. The suite uses real file upload, server save/reload, viewer defaults, duplication, empty dashboards, upstream creation, narrow layout, DuckDB refresh and a local Postgres connection/query. Local Postgres uses `make up-and-down`.

Computer-use checks also exercise native capacity filters combined with category selection, upstream creation/settings and history restore. Lint, frontend unit tests, affected Go tests and the production build are checked separately. Cypress writes screenshots and a video to its ignored output directories.
