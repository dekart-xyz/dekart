Plan: /Users/vladi/dev/magic/docs/ev-public-data-p1-spec-20261110.md — slice 1.

## 2026-11-10

- Tests: `go test ./src/server/dekart ./src/server/conn` passed, including BigQuery/HTTP create, load, MCP discovery, update, clearing and invalid URLs; Wherobots metadata edits without replacing credentials passed.
- Tests: `npm test -- --run` passed (24 files, 180 tests); `npm run lint` and `git diff --check` passed.
- E2E: `make cypress-run ENV_FILE=.env.cloud SPEC="cypress/e2e/cloud/tmpConnectionDocs.cy.js"` passed (1 test), on local Postgres/backend/Vite; real device authorization used for MCP discovery. The feature spec remains ignored under the repository's tmp-spec policy.
- Video: [Cypress recording](/Users/vladi/dev/dekart-b/cypress/videos/tmpConnectionDocs.cy.js.mp4).
- Clean correctness review: one Wherobots edit finding fixed; re-review found no remaining issues.
- Deviations: no contract changes. Fixed the existing Wherobots client update path and its saved-key validation because they prevented editing the new field.
- Files outside the feature: `src/server/dekart/dataset_test.go` SQL fixture gained the selected docs column; this handoff report.
- Candidates for dekart-refactor: none added; existing connection dialog variants remain together.
- Known failures out of scope: none in completed checks. Real Open EV Data workspace acceptance has not run; slice 1 is not fully complete.
- Open questions: published docs URL naming both datasets, deployment of this change, and Vladi's explicit go-ahead to set the live connection URL. No live connection was changed; no files staged, committed or pushed.
