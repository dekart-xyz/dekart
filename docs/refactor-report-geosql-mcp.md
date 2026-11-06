
## 2026-11-04

Refactor complete in `../dekart-b` on `geosql-mcp`.
- Deduplicated creation/list response mapping and expanded the creation response for readability.
- Removed a redundant missing-session check; authentication behavior is unchanged.
- Interface changes introduced by this pass: none; existing changes against HEAD remain documented in the review plan.
- Proposed interface changes and deferred cleanup: none. No Cypress specs changed.
- Verification: `go test ./...`, 179 frontend tests, lint, diff checks and the Google OAuth Cypress creation/poll/display/list/revoke flow passed.
- Independent complexity and maintainability reviews: no actionable findings.
- Snapshot pushed: `geosql-mcp_snapshot_20261104_175449`; working changes remain unstaged and uncommitted.
- Review plan: [review-plan-geosql-mcp.md](review-plan-geosql-mcp.md).
- Review notes: 9 across 6 files. `REVIEW!:` flags: none.
- Workflows: create a settings token; remove a token and reject its next request; collect a token after browser authorization.
