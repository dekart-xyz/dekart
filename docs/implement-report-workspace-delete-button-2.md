Slice 2 plan: /Users/vladi/dev/magic/docs/dekart-workspace-delete-spec-20261017.md

Plan for earlier work: User-provided Workspace Settings Screen Improvement.zip and screenshots (content panels only).

## 2026-10-19

- Implemented General and Danger zone panels, copyable workspace ID, disabled unchanged/empty save, and active-subscription warning. Menu and page title unchanged.
- Tests: `npm test -- --run` — 23 files, 173 tests passed; `npm run lint` and `git diff --check` passed.
- Cypress: local Cloud backend (`.env.cloud`), temporary panel check and scheduled-cancellation regression — 2/2 passed; desktop/mobile screenshots inspected.
- Videos: `cypress/videos/tmpWorkspacePanels.cy.js.mp4`, `cypress/videos/workspaceScheduledCancellation.cy.js.mp4`.
- Clean correctness review: no findings. Reviewer inspected the diff; runtime and mockup checks were performed by the implementation agent.
- Deviations: mockups serve as the plan; retained existing permission checks, billing portal action and deletion confirmation.
- Other files: updated the existing cancellation regression's warning text/scroll; this handoff report. Temporary feature spec remains ignored as required by AGENTS.md.
- Refactor candidates: none.
- Known failures: none remaining; an intercepted request aborted on test reload was resolved by waiting for the save request and checking persistence without reload.
- Unchecked: live billing portal navigation; existing billing action retained.
- Open questions: none. Changes are uncommitted.

## 2026-10-19: Workspace deletion slice 2

- Tests: acceptance test failed first with missing `workspace_id`, then passed for selected, default and absent workspaces using all real SQLite migrations.
- Tests: `go test ./src/server/dekart ./src/server/user -count=1` and `git diff --check` passed.
- PostgreSQL: new migration and prepared inserts passed against a temporary table in a rolled-back transaction; existing rows and events without a workspace retain NULL.
- Clean correctness review: no findings. No frontend changes; Cypress was not run.
- Implemented nullable `track_events.workspace_id` migrations for PostgreSQL and SQLite and stored the current workspace in `TrackEvent`.
- Deviations from the plan: none.
- Files outside the plan: this hand-off report.
- Candidates for dekart-refactor: none; tracking remains in its existing cohesive module.
- Known failures out of scope: none observed.
- Open questions: none. Changes are uncommitted.
