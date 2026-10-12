Plan: /Users/vladi/dev/magic/docs/dekart-ci-strategy-design-20261009.md (slices 1–2)
## 2026-10-09
- Tests: AC1–AC5 static checks pass (34 explicit ordinary specs, all 11 critical paths, 3 perf specs excluded); YAML parses, imports resolve, git diff --check passes. Small and full-size Kepler report load pass on .env.cloud with runPerformance=true (53s / 2m25s). BigQuery archive/updateDataset fail twice before setup because .env.bigquery overrides the inherited license with an empty value. PostGIS smoke not run. Clean correctness review: no remaining findings.
- Videos: [small report load](../cypress/videos/keplerReportLoad.cy.js.mp4), [full-size report load](../cypress/videos/perfKeplerReportLoad.cy.js.mp4). Logs: /tmp/dekart-b-ci-report-load.log, /tmp/dekart-b-ci-bq.log, /tmp/dekart-b-ci-bq-retry.log; static acceptance runner: /tmp/dekart-ci-acceptance.py.
- Deviations: checkout had 88 specs, not 87; local performance proof used perfKeplerReportLoad only (map benchmark needs seeded report inputs). Matrix reduced 27 → 14 lanes, preserving the startup assertion. Green PR proof remains pending; nothing staged, committed or pushed. Stop rule reached after two BigQuery setup failures; implementation is not fully verified.
- Files outside the plan: Makefile now selects retained snowflake/fork for docker-test; CONTRIBUTING.md benchmark commands use perfMapPerformance; this hand-off report.
- Candidates for dekart-refactor: duplicated small/full-size report-load body; unused Cypress helper exports after pruning. No app code changed.
- Known failures out of scope: existing skipped BigQuery widget filter regression remains skipped; local BigQuery license config prevents startup. Next proof must load the nonempty license after the lane env, verify server startup, then run BigQuery and PostGIS; do not edit .env files without permission.
- Open questions: none about implementation; green PR run and deletion-list review remain pending. Put the deletion list below in the eventual PR description.
- Classification: retained ordinary specs have their smoke/regression reason on line 1; mapPerformance/widgetsPerformance renamed perfMapPerformance/perfWidgetsPerformance; full-size report loading moved to perfKeplerReportLoad. Deleted 52 files: basicFlow folded into bq/archive; postgisGeometry folded into pg-s3/happyPath; other deletions are feature walkthroughs, layout checks or duplicate connector smoke paths.
- Deleted from `cypress/e2e/bq/`: `basicFlow.cy.js`, `cancelQuery.cy.js`, `duckdbRefresh.cy.js`, `duckdbRefreshPersistence.cy.js`, `duckdbRefreshReconciliation.cy.js`, `fileUploadMultipart.cy.js`, `noSSOSmoke.cy.js`, `scripts.cy.js`
- Deleted from `cypress/e2e/cloud/`: `connectionSelectorLayout.cy.js`, `datasetSelectorLayout.cy.js`, `geolocationDeniedWarning.cy.js`, `httpSource.cy.js`, `httpSourceCredentials.cy.js`, `httpSourceDatasetUrl.cy.js`, `httpSourceDatasetUrlAuth.cy.js`, `httpSourceTravelTime.cy.js`, `httpSourceVaylensIsochrones.cy.js`, `keplerFilterReload.cy.js`, `keplerPublishWarning.cy.js`, `moreWarehousesSelector.cy.js`, `postgresTlsConnectionHappyPath.cy.js`, `widgetsCategoryLayout.cy.js`, `widgetsChartError.cy.js`, `widgetsCrossFilter.cy.js`, `widgetsFilterSync.cy.js`, `widgetsLegacyStyleCompatibility.cy.js`, `widgetsMcpUpdateFilter.cy.js`, `widgetsMultiDataset.cy.js`, `widgetsPolygonMapFilter.cy.js`, `widgetsPolygonMapFilterGeometry.cy.js`, `widgetsSearch.cy.js`, `workspaceSource.cy.js`
- Deleted from `cypress/e2e/google-oauth/`: `basicFlow.cy.js`, `mcpBigQueryRequiresServiceAccount.cy.js`
- Deleted from `cypress/e2e/local/`: `additionalWorkspaceCreation.cy.js`, `defaultWorkspaceManagement.cy.js`, `duckdb.cy.js`, `duckdbUploadSpatial.cy.js`, `mcpHttpSource.cy.js`, `mcpPgHappyPath.cy.js`, `mcpSnapshotViewport.cy.js`, `mcpWorkspaceRoles.cy.js`, `readmeMarkdown.cy.js`, `reportHistory.cy.js`
- Deleted from `cypress/e2e/pg/`: `geosqlBanner.cy.js`, `happyPath.cy.js`
- Deleted from `cypress/e2e/pg-s3/`: `postgisGeometry.cy.js`
- Deleted from `cypress/e2e/snowflake/`: `happyPath.cy.js`, `runAllQueries.cy.js`
- Deleted from `cypress/e2e/snowflake-s3/`: `emptyResult.cy.js`, `fork.cy.js`
- Deleted from `cypress/e2e/version/`: `spec.cy.js`

## 2026-10-09 — config recovery and resumed verification
- Tests: BigQuery archive and updateDataset pass together on .env.bigquery (2 passing, 1 previously pending; 57s). PostGIS happyPath and runAllQueriesLegacyMissingSource pass together on .env.pg-s3 (2 passing; 20s). AC1–AC5 static checks and git diff --check pass again. Earlier small/full-size report-load proof and clean review remain valid; app and test code unchanged in this turn.
- Videos: [BigQuery archive](../cypress/videos/archive.cy.js.mp4), [dataset refresh](../cypress/videos/updateDataset.cy.js.mp4), [PostGIS smoke](../cypress/videos/happyPath.cy.js.mp4), [legacy missing source](../cypress/videos/runAllQueriesLegacyMissingSource.cy.js.mp4). Logs: /tmp/dekart-b-ci-bq-fixed.log and /tmp/dekart-b-ci-pg-fixed.log.
- Deviations: PostGIS initially failed because the local vanilla Postgres fixture lacked ST_MakeEnvelope. Reproduced the missing function, then supplied the same PostGIS version used by CI; assertions unchanged. Green PR proof still pending; no stage, commit or push.
- Files outside the plan: user-authorized, gitignored .env.bigquery now uses the existing local license; .env.pg-s3 datasource now points to localhost:5444/dekart_geo. No secret values were printed or added to tracked files.
- Local fixture: existing postgis/postgis:15-3.4 image started as dekart-b-postgis-ci on 127.0.0.1:5444, with PostGIS and the CI sample.geospatial_points seed (150 rows). Container remains running for the corrected .env.pg-s3 configuration; no image rebuilt. Start it later with docker start dekart-b-postgis-ci.
- Candidates for dekart-refactor: unchanged from the prior report.
- Known failures out of scope: existing skipped BigQuery widget-filter test; no remaining focused-test failures.
- Open questions: none; PR validation and deletion-list review remain pending.

## 2026-10-09 — widget regression reproduction
- Bug: widgetsCrossFilterWithoutCharts.cy.js previously failed with React “Maximum update depth exceeded” after queryParameterStream.cy.js on the unchanged tree.
- Tests: isolated widgetsCrossFilterWithoutCharts passed (1 test, 27s); exact preceding sequence queryParameterStream + widgetsCrossFilterWithoutCharts passed (3 tests, 23s + 26s). Both runs used make cypress-run ENV_FILE=.env.cloud against make server .env.cloud and make client with clone-local Postgres.
- Video: [widget regression rerun](../cypress/videos/widgetsCrossFilterWithoutCharts.cy.js.mp4); logs: /tmp/dekart-b-implement-red.log and /tmp/dekart-b-implement-sequence.log.
- Deviations: stopped under the skill’s non-reproducing-bug rule; no speculative fix, source edits, test edits, or correctness review.
- Files outside the bug: this report only. Nothing staged, committed, or pushed.
- Candidates for dekart-refactor: none added by this turn.
- Known failures out of scope: the original intermittent React failure remains unexplained; passing reruns do not prove it fixed.
- Open questions: what timing or runtime condition triggered the first failure? Preserve /tmp/dekart-b-refactor-cypress.log as original evidence.

## 2026-10-09 — connection-test timeout fix
- Tests: cloudBasicFlowEnd passed unchanged on .env.cloud (1 test, 26s); postgresConnectionUsesEnteredHost reproduced the 30s missing-response failure, then passed unchanged after the fix (1 test, 18s). Go deadline regression failed with the old implementation (1s outer timeout), passed with the connector fix; final go test ./... and git diff --check passed.
- Video: [Postgres entered-host regression](../cypress/videos/postgresConnectionUsesEnteredHost.cy.js.mp4); [BigQuery flow rerun](../cypress/videos/cloudBasicFlowEnd.cy.js.mp4). Logs: /tmp/dekart-b-implement-connections-red.log, /tmp/dekart-b-implement-connections-green.log, /tmp/dekart-b-implement-pg-deadline-red.log, /tmp/dekart-b-implement-pg-deadline-green.log, /tmp/dekart-b-implement-connections-final-go.log.
- Fix: TestConnection in src/server/pgjob/pgjob.go uses pq.NewConnector + sql.OpenDB so lib/pq receives the existing ping context and its five-second deadline during TCP dialing. Added public-boundary regression src/server/pgjob/pgjob_test.go for the same unreachable host with a shorter caller deadline.
- Deviations: BigQuery failure did not reproduce; no speculative change to that path. No Cypress spec or environment file edited. Clean correctness review: no findings.
- Files outside the bug: this report only. No stage, commit, or push.
- Candidates for dekart-refactor: none introduced.
- Known limitations: regression uses the documentation IP 192.0.2.1; an immediate network refusal could let the old implementation pass elsewhere. lib/pq TLS/startup hangs after TCP connects remain an existing limitation outside the observed dialing failure; the earlier BigQuery intermittent failure remains unexplained.
- Open questions: none for the reproduced Postgres dialing failure.

## 2026-10-10 — Postgres regression-spec setup
- Tests: both PG specs previously failed on the nonexistent Run SQL button with the SQL editor already open. After setup correction, datasetSourceWriteTimeout passes (1 test, 19s) and keplerFilterRestore passes (1 test, 17s). Standard lint for both edited specs and git diff --check pass. Clean correctness review: no findings.
- Runtime: make server /tmp/dekart-b-pg-runtime.sh loads .env.pg with the existing local license and PostGIS datasource from .env.pg-s3, then sets the CI HTTP write timeout to five seconds; Cypress runs through make cypress-run ENV_FILE=.env.pg. No env files edited.
- Videos: [streaming beyond write timeout](../cypress/videos/datasetSourceWriteTimeout.cy.js.mp4), [native filter restoration](../cypress/videos/keplerFilterRestore.cy.js.mp4). Log: /tmp/dekart-b-implement-1010-pg.log; before-change evidence: /tmp/dekart-b-refactor-1010-pg-fixed.log.
- Deviations: none. Removed only the obsolete source-selection click from each spec and added a rationale comment; all SQL, timeouts and regression assertions remain unchanged. No production code changed in this pass.
- Files outside the bug: this report only. Nothing staged, committed or pushed.
- Candidates for dekart-refactor: none introduced; prior candidates remain in the refactor report.
- Known failures out of scope: remaining connector and performance baseline checks are not fully verified. The prior Go deadline regression retains the already-documented network-dependent limitation.
- Open questions: none for these two specs.

## 2026-10-12 — Snowflake fork setup
- Tests: fork.cy.js failed looking for textarea while the source chooser was open; selecting Run SQL directly on Snowflake makes the original query/share/fork assertions pass (1 test, 40s). Standard lint for the spec and git diff --check pass. Correctness review found no issue with the fork setup; it reiterated the previously documented network-dependent Go deadline-test weakness, outside this setup change.
- Video: [Snowflake fork](../cypress/videos/fork.cy.js.mp4); log: /tmp/dekart-b-implement-1012-fork.log. Runtime: .env.snowflake with existing license and working Snowflake credentials restored after the lane through /tmp/dekart-b-snowflake-runtime.sh; no env files edited.
- Deviations: none; one source-selection click and rationale comment added, all regression assertions unchanged. No production code changed in this implementation step.
- Files outside the bug: this report only. No stage, commit or push.
- Candidates for dekart-refactor: prior helper cleanup candidates remain.
- Known failures out of scope: the Go deadline test can pass on an immediate network refusal; remains documented as a residual limitation. Athena initially exceeded its four-second initial UI wait, then passed unchanged (1 test, 15s).
- Open questions: none; user authorized automatic handling of further test-setup fixes while resuming refactoring.

## 2026-10-12 — Expired-license MCP setup
- Tests: licenseExpiredReadOnly failed with HTTP 404 through the frontend origin. It now calls the configured API origin and authenticates through the existing device flow before asserting the unchanged HTTP 403 and license-expiry error. Passes (1 test, 4s); expired-license member-role UI passes (1 test, 11s). Spec lint and git diff --check pass. Fresh correctness review: no new actionable findings.
- Runtime: existing local signing key issues an expired temporary test license; startup permits that expired license using the existing development flag. No env files or production code edited. Log: /tmp/dekart-b-implement-1012-expired-auth.log.
- Deviations: only API origin and required MCP authentication setup changed; license gates and regression assertions remain intact.
- Files outside the bug: this report only. No stage, commit or push.
- Candidates for dekart-refactor: prior unused-helper candidates remain.
- Known limitations: the prior network-dependent Go deadline regression remains unchanged and documented above.
- Open questions: none.
