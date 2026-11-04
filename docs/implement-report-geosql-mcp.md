Plan: /Users/vladi/dev/magic/docs/geosql-mcp-spec-20261104.md

## 2026-11-04 — Slice 1: Dekart tokens
- Tests: initial Go regressions reproduced acceptance of revoked/pre-fix tokens; missing creation RPC failed compilation; Cypress failed on the missing creation button.
- Tests: `go test ./...` passed; focused deviceauth/user/dekart suites passed after final test updates.
- Tests: `npm test -- --run` passed (24 files, 179 tests); `npm run lint` and `git diff --check` passed.
- Tests: Cypress creation/poll prevention/one-time display/list/revoke flow passed with `.env.local` (SQLite, no auth), then `.env.googleoauth` (Postgres, Google OAuth with dev claims for browser identity).
- Command: `make cypress-run ENV_FILE=.env.googleoauth SPEC="cypress/e2e/google-oauth/tmpCreateDeviceToken.cy.js"`.
- Video: /Users/vladi/dev/dekart-b/cypress/videos/tmpCreateDeviceToken.cy.js.mp4
- Review: clean correctness review found no issues; no generated files edited manually (`make proto`).
- Deviations: none; acceptance spec intentionally starts with `tmp` and is ignored under the repository's feature-driving test policy.
- Files outside plan: none; this uncommitted handoff report is required by dekart-implement.
- Refactor candidates: none required for this slice.
- Known failures outside scope: none. Initial Vite IPv6 binding was resolved using `NODE_OPTIONS=--dns-result-order=ipv4first make client` without config edits.
- Open questions: none for slice 1. Existing CLI users must run `dekart init` again after deployment because tokens without device_id are rejected.
- Git: left all changes unstaged and uncommitted on existing branch `geosql-mcp`.
