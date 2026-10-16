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

## 2026-10-16

- Cleanup mode; no substantive refactor justified after mapping and two independent reviews.
- Deleted, deduplicated or extracted: none; preserving conditional save waits avoids changing async timing.
- Refactor interface diff against the starting tree/HEAD: none; existing implementation exports remain unchanged.
- Candidates for `dekart-refactor-plan`: none; no dark libraries touched.
- Verified current source, specs and untracked README test match green CI commit `97fa0a31` before review notes.
- CI run 38871906731: all checks green, including parameter stream (2), report saves (9), PostgreSQL/S3 (4) and local file-upload lanes.
- Local `go test ./...`, seven client action tests and full client lint passed.
- Local Chrome hit a held-response timeout; Electron passed that test but stalled after the second test froze timers.
- Temporary Electron diagnostic advanced frozen timers by 100 ms around editor operations: second test passed; temporary spec removed.
- No original Cypress spec edited; local runtime timing differences remain outside this structural pass.
- Complexity and maintainability reviews: no actionable findings.
- Human review plan: four REVIEW notes, no REVIEW! flags; working changes remain unstaged and uncommitted.
- Snapshot: `fix-map-layer-could-not-be-displayed_snapshot_20261016_103823` pushed.

## 2026-10-16 — Precondition check after dedicated README removal

- Cleanup mode stopped before editing: the current Cypress safety net is not green.
- Snapshot pushed: `fix-map-layer-could-not-be-displayed_snapshot_20261016_115138`.
- Passed: `go test ./...`, all 11 client action tests, full client lint, and `git diff --check`.
- Cypress command: `make cypress-run ENV_FILE=.env.cloud SPEC="cypress/e2e/cloud/queryParameterStream.cy.js" CYPRESS_ARGS="--browser chrome --quiet --reporter dot"`.
- Result: 0 passing, 2 failing; local native cloud server, Vite, existing local PostgreSQL.
- First failure: held `UpdateReport` response Promise exceeded the 4000 ms callback limit.
- Second failure: `station` parameter input was absent at spec line 125 after timers were paused.
- Evidence: `/tmp/dekart-refactor-cypress.log`; `cypress/videos/queryParameterStream.cy.js.mp4`.
- Return to `dekart-implement` to resolve the test/runtime failures before another refactor pass.
- Deleted, deduplicated or extracted: none. Interface diff introduced by this pass: none.
- No code or Cypress specs edited. Remaining Cypress runs and structural reviews deferred.
- Existing superseded human review plan retained; no final review plan generated for an incomplete pass.
- Working changes remain unstaged and uncommitted.

## 2026-10-16 — Local setup and timing verification

- The initial stop did not establish a product regression; local/test timing contributes.
- Checked cloud/dev-claim flags, local PostgreSQL connectivity, and installed proto hashes; all match the intended runtime/source.
- With `defaultCommandTimeout=15000`, the first test passed in Chrome and Electron against Vite, without source or original-spec edits.
- The second test still lost `station` at line 125 in both browsers; longer real-time waits alone did not fix it.
- Built the current tree with `npm run build` and served it from the Go server at `http://localhost:8080`, matching CI's single-origin production client arrangement.
- Restarted the server after building because its cached HTML still referenced removed bundle hashes; discarded that invalid run.
- Fresh production full spec initially reproduced the second failure; an isolated diagnostic copy without timer advances passed.
- Diagnostic timer advances allowed an actual local SQL save and changed the scenario; that experiment does not explain the original failure.
- Final untouched full-spec rerun: **2 passing (19 seconds)**, Electron, fresh production build, 15-second timeout.
- Command: `make cypress-run ENV_FILE=.env.cloud SPEC="cypress/e2e/cloud/queryParameterStream.cy.js" CYPRESS_ARGS="--browser electron --quiet --reporter dot --config defaultCommandTimeout=15000,baseUrl=http://localhost:8080"`.
- Evidence: `/tmp/dekart-setup-production-repeat.log`; preceding comparisons in `/tmp/dekart-setup-chrome15.log`, `/tmp/dekart-setup-electron15.log`, `/tmp/dekart-setup-production-fresh.log`, `/tmp/dekart-setup-requests-original.log`.
- Conclusion: no confirmed product regression or missing local dependency/configuration; second-test intermittency remains unexplained. Default-timeout reliability is not proven.
- Temporary diagnostic spec removed. No application, original Cypress spec, or environment file changed.

## 2026-10-16 — Completed cleanup after test stabilization

- Cleanup: wrapped the new removal transaction calls and removed a stray blank line in `src/server/dekart/readme.go`.
- Deleted, deduplicated or extracted logic: none; no further abstraction justified.
- Refactor interface diff against the starting tree: none. The pre-existing implementation's proto/export changes against HEAD remain intact.
- Candidates for `dekart-refactor-plan`: none required; report save coordination remains together rather than adding cross-module exports.
- Verification: full Go tests, 11 client action tests, client lint, and diff checks passed.
- Cypress proof: implementation-report green runs cover report saves, PostgreSQL/S3 and local saved layers; stabilized parameter stream passed twice each in Chrome and Electron.
- Cypress specs and proto files match the starting snapshot; no dark library touched.
- Complexity and maintainability reviewers: no actionable findings.
- Added eight REVIEW notes across five source files; two earlier notes retained; no REVIEW! flags.
- Human review plan regenerated for README removal, saving the initial map, and reload before the first save.
- Deferred: existing onboarding redirect flake, CI/container rerun, and the cause of missing production result objects.
- Snapshot pushed: `fix-map-layer-could-not-be-displayed_snapshot_20261016_132921`; working changes remain unstaged and uncommitted.

## 2026-10-16 — Deduplicate report command handling

- Deduplicated the callback-to-Promise RPC/error adapter used by map saves and README removal in private `callReportUpdate`.
- Centralized canonical-wait cancellation in `resumeReportUpdates`; removed repeated cancellation from removal and navigation cleanup.
- Removed the obsolete `TODO Promise all` comment from `saveMap`.
- Kept each command's completion rule explicit: saves finish on acknowledgement; removal waits for canonical stream content.
- No new shared state, lifecycle modes, public exports, proto fields, HTTP/MCP contracts or dependencies.
- Refactor interface diff against the starting tree: none; existing implementation interface changes against HEAD remain intact.
- Candidate for `dekart-refactor-plan`: delete `actions/readme.js`'s `removeReadme` re-export and update `ReportPage.jsx` / `actions/readme.test.js` to import directly from `actions/report.js`; cleanup mode cannot remove that export.
- Fresh verification: full Go tests, 11 client action tests, client lint, parameter-stream Cypress (2) and full report-save Cypress (12) passed.
- All Cypress specs and generated/proto files are unchanged from the snapshot; no dark library touched.
- Complexity and maintainability reviewers inspected complete command paths; no actionable findings.
- Human review plan refreshed; two new REVIEW notes, no REVIEW! flags.
- Deferred: re-export interface change, existing onboarding flake, CI/container rerun and missing production-object cause.
- Snapshot pushed: `fix-map-layer-could-not-be-displayed_snapshot_20261016_134139`; no staging or commit in this pass.

## 2026-10-16 — Remove the obsolete README re-export

- Explicit user instruction supersedes cleanup mode's export restriction for this change.
- Deleted the `removeReadme` re-export and its obsolete REVIEW note from `actions/readme.js`.
- Updated `ReportPage.jsx` and `actions/readme.test.js` to import directly from `actions/report.js`.
- Interface change: `actions/readme.js` no longer exports `removeReadme`; the implementation and behavior are unchanged.
- The previously proposed re-export follow-up is resolved; human review plan updated.
- All 11 client action tests, full client lint and diff checks passed; clean review found no issues.
- No Cypress or application behavior change; browser tests were not repeated for this import-only edit.
- Existing staged changes preserved; new edits remain unstaged.

## 2026-10-16 — Report command reconciliation refactor

- Implemented `docs/report-command-reconciliation-refactor.md`; marked it implemented.
- Consolidated versioning, waiting, RPC handling, status and stream cleanup in `reportCommand`.
- Removed private `callReportUpdate` and duplicate command lifecycle code; restored `removeReadme` to `actions/readme.js` and its callers.
- Interface diff against HEAD: added `reportCommand(method, buildRequest, onAccepted = () => {})`; retained existing action signatures and pre-existing working-tree RemoveReadme wire fields. No dark API changes.
- Preserved all six removal regressions; added two public command contract tests. No Cypress spec changed during this pass.
- Verification: 170 frontend tests, `npm run lint`, `go test ./...`, 17 Cypress tests (12 report-save, 2 parameter-stream, 2 PostgreSQL/S3 recovery, 1 local-upload), and `git diff --check` pass.
- Complexity, maintainability and interface reviewers: no actionable findings.
- Deferred: reconnect/coalescing and late navigation acknowledgements still lack complete Cypress coverage; no additional interface changes proposed.
- Runtime: PostgreSQL already occupied its default port; reused it. Local-upload proof needed Vite IPv4 resolution. No environment files changed.
- Snapshot: `fix-map-layer-could-not-be-displayed_snapshot_20261016_160756` pushed; working changes remain uncommitted and index preserved.
- Human review: `docs/review-plan-fix-map-layer-could-not-be-displayed.md`; four new REVIEW notes, no REVIEW!: flags.
- Workflow: remove a README.
- Workflow: save report metadata and map drafts.
- Workflow: reload before the first map save.

## 2026-10-16 — Explicit stream-wait option

- `reportCommand` takes `{ waitForReportUpdate = false, onAccepted = () => {} }`; README removal explicitly enables waiting and map saves retain acknowledgement completion.
- Removed both `RemoveReadme` method checks from lifecycle selection; retained existing command-specific error reporting.
- Updated callers and the design/review documents. Added one contract case proving UpdateReport can select stream waiting independently of its method.
- Verification: 14 action tests, full client lint and diff whitespace checks pass. Cypress was not rerun for this parameter-only refactor.

## 2026-10-16 — Explicit failure callbacks

- `reportCommand` accepts `onFailed(dispatch)` for caller failure bookkeeping and `onError(error)` for transport error reporting; no RPC-method comparisons remain in the wrapper.
- `saveMap` supplies its existing saveMapFailed dispatch and Aborted suppression. Default failure cleanup remains scoped to the open report; default error reporting returns the original error.
- Updated interface documentation and added Aborted/non-Aborted map-save error cases. Verification: 16 action tests, client lint and whitespace checks pass; Cypress not rerun for this callback extraction.
