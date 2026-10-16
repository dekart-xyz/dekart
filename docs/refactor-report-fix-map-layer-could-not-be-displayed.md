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
