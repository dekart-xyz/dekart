Plan: /Users/vladi/dev/magic/docs/dekart-shared-maps-list-spec-20261111.md

## 2026-11-12 — Slice 1: server list

- Tests: all five SQLite acceptance cases pass, including connection types, admin/editor/viewer roles, revocation, archive exclusion, unrelated members, and other-workspace recipients.
- Tests: confirmed expected failures before implementation; focused test and `go test ./...` pass; `git diff --check` passes.
- Clean correctness review: no findings.
- Deviations from plan: none. Slice 1 requires Go tests only; Cypress belongs to slice 2.
- Files outside plan: this handoff report only. Implementation: `src/server/dekart/stream.go`; acceptance tests: `src/server/dekart/reportlist_test.go`.
- Candidates for dekart-refactor: the sharing SQL now repeats getReport's existing predicate; keep the two aligned if sharing rules change. The existing large stream.go remains cohesive stream handling; no split needed for this slice.
- Known failures out of scope: none. PostgreSQL and server-configured connection behavior are not exercised by these SQLite tests; the configured branch was reviewed against conn.CanShareReports().
- Open questions: none. Changes are unstaged and uncommitted.

## 2026-11-12 — Slice 2: Shared Maps tab and Cypress

- Tests: `.env.cloud` Cypress acceptance cases 2/2 and existing `sharedWorkspaceEditorAccess.cy.js` cases 5/5 pass. Before the filter change, the email-shared card assertion failed as expected; the public-link case passed.
- Tests: `npm test -- --run` passes (180 tests); `npm run lint`, `go test ./...`, and `git diff --check` pass. Clean correctness review: no findings.
- Video: [acceptance cases](../cypress/videos/emailSharedMaps.cy.js.mp4); [existing regression cases](../cypress/videos/sharedWorkspaceEditorAccess.cy.js.mp4).
- Deviations from plan: CI is pending; the new spec is listed once in the cloud-core lane. Changes remain unstaged and uncommitted.
- Files outside plan: this handoff report only. Slice 2 changes `src/client/reducers/reportReducer.js`, `cypress/e2e/cloud/emailSharedMaps.cy.js`, and `.github/workflows/e2e.yaml`.
- Candidates for dekart-refactor: none added in slice 2; the reducer remains cohesive, so no split was needed.
- Known failures out of scope: none observed. The remaining cloud specs and CI were not run this turn.
- Open questions: none.
