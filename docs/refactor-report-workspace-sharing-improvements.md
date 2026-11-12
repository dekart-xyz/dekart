## 2026-11-12 — Cleanup pass

- Moved private report-list assembly from `stream.go` to the cohesive `reportlist.go`; stream registration remains in `stream.go`.
- Removed duplicated report and connection-type queries by choosing one filter and argument list for workspace or playground access.
- Removed three redundant checks: SQL already excludes NULL connection types, and Go permits nil-map lookup and range.
- Public interface diff against HEAD: none. No Cypress spec, acceptance test, or generated file changed during cleanup.
- Verification: `go test ./...`, 180 frontend tests, lint, and both relevant Cloud Cypress specs (7 cases) pass; Cypress passed again after the last check removals.
- Complexity and clean maintainability reviewers: no actionable findings after fixes.
- Interface changes proposed for `dekart-refactor-plan`: none.
- Deferred: the sharing eligibility SQL still repeats the existing rule in `getReport`; configured-connection behavior remains a coverage gap.
- Required snapshot: `workspace-sharing-improvements_snapshot_20261112_080332`, pushed without switching branches.
- Review aid: `docs/review-plan-workspace-sharing-improvements.md`; three explanatory review notes, no `REVIEW!:` flags.
- Changes remain unstaged and uncommitted.
