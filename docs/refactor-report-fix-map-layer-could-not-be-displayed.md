# Refactor report: fix-map-layer-could-not-be-displayed

## 2026-10-15

- Cleanup mode; missing-result recovery behavior preserved.
- Moved the existing missing-result Go tests and storage fixtures into `datasetstorage_test.go`.
- Restored `dataset_test.go` to HEAD; snapshot-credential tests remain there.
- Wrapped the new SQL arguments and handler calls in `dataset.go`.
- No logic deleted, deduplicated or extracted; no further abstraction justified.
- Refactor interface diff against HEAD: none; the baseline fix retains its intended 404-to-410 response change.
- Candidates for `dekart-refactor-plan`: none.
- Verification: `go test ./...`, five focused client tests, lint, shell syntax and diff checks passed.
- Cypress: prior green Chrome/Postgres/local-S3 run recorded in the implement report; not rerun in this pass.
- Cypress spec, deletion helper, client tests and CI lane match the pre-refactor snapshot byte for byte.
- Complexity and maintainability reviewers: no actionable findings.
- Human review plan includes two REVIEW notes and no REVIEW! flags.
- Deferred: cause of missing production objects and prior Electron initialization stall remain outside scope.
- Required snapshot pushed; working branch and refactor changes remain unstaged and uncommitted.
