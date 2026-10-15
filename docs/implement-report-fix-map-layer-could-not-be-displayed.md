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
