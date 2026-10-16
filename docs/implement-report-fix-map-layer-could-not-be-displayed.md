Plan: `docs/missing-query-result-recovery-spec.md`

## 2026-10-14

- Tests: the initial Go regression returned 404 where 410 was required. After the
  fix, `go test ./src/server/dekart ./src/server/storage` passed, including handler
  read-stage failures, real SQLite ownership/completion exclusions, and unchanged
  storage branches.
- Client: `npm test -- --run src/client/actions` passed (5 tests).
  `npm run lint`, targeted Standard checks, shell syntax, and diff checks passed.
- Cypress: the `pg-s3` missing-result regression passed in Chrome (18 seconds),
  using local Postgres and local Moto S3 storage. A real CSV was deleted; its
  request returned 410, the query reran, and the map data table showed value 42.
  Command: `AWS_ENDPOINT=http://127.0.0.1:9016 make cypress-run ENV_FILE=.env.pg-s3
  SPEC="cypress/e2e/pg-s3/missingQueryResultRecovery.cy.js" DEKART_PORT=8086
  DEKART_CLIENT_PORT=3006 CYPRESS_ARGS="--browser chrome"`.
  Video: `cypress/videos/missingQueryResultRecovery.cy.js.mp4`.
- Clean correctness review: no findings.
- Deviations: no behavior changes from the plan. The test uses latitude/longitude
  columns because the local Postgres fixture has no PostGIS. Chrome was required
  for local proof; Electron 118 stalled while initializing DuckDB before deletion.
- Files outside the named implementation targets: the native curl deletion helper
  in `cypress/support/deleteStoredResult.sh`, plus this handoff report. The Cypress
  regression is registered in the existing `pg-s3-postgres` CI lane.
- Refactor candidates: none required for this change.
- Known failures out of scope: local Electron 118 did not finish initial dataset
  loading. CI image/default-browser execution has not been verified.
- Open questions: why production result objects disappeared remains unknown.
- Git: changes remain unstaged and uncommitted.

## 2026-10-16 — Reload before the first successful map save

Plan: current chat bug report; extends `docs/missing-query-result-recovery-spec.md`.

- Tests: the new regression failed before the fix: the query row returned after reload, but its layer did not. The affected client and query/report server paths match main; the reproduction does not delete a stored result.
- Results: all four PostgreSQL/S3 E2E tests and the local file-upload saved-layer test pass. Five client action unit tests, full client lint, targeted Cypress lint, and diff checks pass. Clean correctness review: no findings.
- Fix: infer initial default layers when no map configuration has been saved, even if the query result already exists. Preserve deliberately saved empty maps. Remove the explicit-save workaround from the missing-result test.
- Deviations: extend the original missing-result plan to the reproduced first-save layer loss. This restores defaults; it does not persist arbitrary unsaved map edits.
- Files outside the original plan: `src/client/actions/report.js`; this handoff update.
- Refactor candidates: none required.
- Known failures: none remaining. Local PostGIS/query-URL and IPv4/IPv6 test-runtime mismatches were resolved without changing repository environment files; the isolated PostGIS runtime was removed afterward.
- Open questions: none for the reproduced default-layer loss.
- Git: changes remain local, unstaged and uncommitted.
- Video: `cypress/videos/missingQueryResultRecovery.cy.js.mp4`; adjacent proof: `cypress/videos/mapConfigAutoLayers.cy.js.mp4`.
