Plan: `/Users/vladi/dev/magic/docs/dekart-amazon-oidc-cli-spec-20261110.md`

## 2026-11-10 — Slice 1: server identity

- Tests: confirmed the expected failures first; 16 Amazon identity cases through `GetContext` and the anonymous query-source regression now pass. Full `go test ./src/server/user ./src/server/dekart -count=1` passes; `git diff --check` passes. Tests use local SQLite, cached test keys and no network.
- Clean correctness review: no findings; reviewer independently ran both package suites successfully.
- Deviations from plan: none in behavior or interfaces. Added missing-token, malformed-authorization and tampered-device cases alongside the enumerated identity cases. Cypress and manual CLI verification belong to slice 2.
- Files outside plan: this handoff report only. Code/test files: `src/server/user/claims.go`, `src/server/user/claims_test.go`, `src/server/dekart/querysource.go`, `src/server/dekart/querysource_test.go`.
- Candidates for `dekart-refactor`: Amazon and Google branches repeat the snapshot report-id check; consider sharing it in a separate pass.
- Known failures out of scope: none observed. Real ALB key retrieval and browser/CLI integration were not exercised.
- Open questions: none for slice 1. Changes remain unstaged and uncommitted.

