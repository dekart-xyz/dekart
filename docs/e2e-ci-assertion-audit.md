# E2E assertion audit for CI balance

This table is ready to copy into the PR description. The runtime config is part of the reason: similar assertions in different configs remain when they cover a distinct integration.

| Spec or assertion | Decision | Retained coverage and reason |
|---|---|---|
| `pg/cancelQuery.cy.js` | Delete | `bq/cancelQuery.cy.js` exercises the shared `BasicJob.Cancel` path. |
| `snowflake-s3/cancelQuery.cy.js` | Delete | `bq/cancelQuery.cy.js` covers the same cancel behavior. |
| `snowflake-s3/spec.cy.js` happy path | Delete | `snowflake-s3/happyPath.cy.js` has the same query, result, and download assertions under the same config. |
| `snowflake-s3/spec.cy.js` cancel case | Delete | `bq/cancelQuery.cy.js` covers the shared cancel behavior. |
| `athena/spec.cy.js` cancel case | Delete | `bq/cancelQuery.cy.js` covers the shared cancel behavior; Athena's query smoke remains. |
| `google-oauth/basicFlow.cy.js` empty result case | Delete | `snowflake-s3/emptyResult.cy.js` retains the client empty-result assertion; Google OAuth still has its auth smoke. |
| `local/userDefinedConnectionHappyPath.cy.js` | Merge into `local/mcpPgHappyPath.cy.js` | The latter already creates a Postgres connection in the UI. It now also verifies a PostGIS geometry query produces a geojson layer and polygon data cell. |
| `cloud/freeWorkspaceMapLimit.cy.js` | Delete | The 0.25 release replaced the three-map Personal limit with a trial gate (`docs/release-notes-0-25-0.md`). The spec asserted removed copy and allowed a fourth map in a local run. `cloud/trialAcknowledgement.cy.js` covers the current gate. |
| `cloud/widgetsFirstSlice.cy.js` filter persistence | Keep | Number/Category widget selection and histogram behavior. |
| `cloud/widgetsMultiDataset.cy.js` filter persistence | Keep | Multiple-dataset widget binding. |
| `cloud/keplerFilterReload.cy.js` filter persistence | Keep | Native Kepler filter, rather than a widget-owned filter. |
| `cloud/widgetsMcpUpdateFilter.cy.js` filter persistence | Keep | MCP update preserves the chart filter after report reconciliation. |
| `cloud/widgetsSearch.cy.js` filter persistence | Keep | Search widget's multi-value selection and escaping. |
| `local/duckdb.cy.js` SQL and error states | Keep | Browser-local query engine and error propagation without a warehouse source. |
| `bq/duckdbRefresh*.cy.js` query states | Keep | BigQuery source refresh, reconciliation, cancellation, and persistence. |
| `snowflake/fork.cy.js`, `snowflake-s3/fork.cy.js` | Keep both | Empty parameters and visualization style are different assertions under different storage. |
| `cloud/postgresTlsConnectionHappyPath.cy.js`, `cloud/postgresConnectionUsesEnteredHost.cy.js` | Keep both | TLS and entered-host regressions are separate cloud connection behaviors. |
| `snowflake/runAllQueries.cy.js`, `pg-s3/runAllQueriesLegacyMissingSource.cy.js` | Keep both | Normal run-all and legacy missing-source behavior differ. |
