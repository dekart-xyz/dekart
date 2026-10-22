Plan: No plan file; Meet5 workspace deletion bug reproduced in TestDeleteWorkspaceUnfinishedUpload.

## 2026-10-22

- Tests: reproduced the original NULL-to-string failure before the fix; all TestDeleteWorkspace tests and the full src/server/dekart Go package pass after the fix. git diff --check passes.
- Review: clean correctness review found no actionable issues.
- Change: read file_source_id as sql.NullString; remove unfinished file rows while skipping storage cleanup when no source object exists.
- Deviations: used the existing Go regression test at the lowest reproducing layer; Cypress was not run.
- Files: src/server/dekart/workspacedeleteobjects.go and src/server/dekart/workspacedeletestorage_test.go. This report is the only additional file.
- Candidates for dekart-refactor: none.
- Known failures out of scope: none observed. PostgreSQL and browser validation were not run locally.
- Open questions: none. Changes remain unstaged and uncommitted; no deployment performed.
