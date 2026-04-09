# Agent Rules

## Elegant Software Standard

- Solve problem in the simplest correct way with minimal code added.
- Avoid unnecessary new abstractions, options, and moving parts.
– Before completing task check if solution can be simplified. And if so, simplify it before reporting as done.

Decision heuristic: pick the simplest solution that fully works and cannot be simplified further without breaking correctness.

## Hard Rules

- Follow existing project conventions before introducing new patterns.
- Use canonical state, not ad-hoc component logic: check reducers/actions/selectors for an existing field before deriving behavior in components. If missing, add it once in the state layer.
- Never edit generated files manually. Regenerate with `make proto`.
- Never force-push. Never drop or destructively alter migrations without explicit approval.
– Any endpoint with business must be implemented in the server/dekart (dekart server) as method of dekartServer, and wired in app.go. Don't cretare new services.
– Domain logic when possibble should be implemented in the server/<domainname> package, and wired in server/dekart or server/app when necessary.
– Use GRPC by default for clinet to server communication.
- Add a short purpose description for each new function.
- Do not use debug-level logging in production code paths.
- use ant.d components for UI when possible, and match existing UI patterns and placement.
– No snake case in go file names except proto and test files. Use short all-lowercase file naes.

## Style Rules

- When extending a function over 50 lines, refactor to keep functions under 50 lines using the smallest extraction needed.
– When extending existing go file, make sure to keep files under 300 lines limit, and split into multiple files if needed.
- Prefer established libraries for standard concerns over custom implementations.
- For non-trivial business-logic blocks (especially complex conditions), add a very short `[why]` comment.
- Keep test structure consistent with neighboring tests in the same folder.

## Skill Failure Recovery

When a skill or command fails, do not stop at the first error.

1. Diagnose and retry with corrected flags/inputs.
2. If still broken, fall back to direct commands and complete the goal.
3. Escalate to the user only for missing credentials, destructive-action approval, or conflicting decisions.

## Skills

- **Release notes** (`skills/release-notes/SKILL.md`): use when asked to write release notes for a version or tag range.
- **Cypress tests** (`skills/cypress-quick-start/SKILL.md`): use when asked to run or debug Cypress E2E tests. Remember: prefix commands with `ELECTRON_RUN_AS_NODE=`.
- **Code style** (`skills/code-style/SKILL.md`): CSS modules, React patterns, redundant checks, protobuf rules. Use for implementation/refactor tasks, not non-code tasks.
- **Dev runtime** (`skills/dev-runtime/SKILL.md`): use when starting local dev, debugging server/frontend, or setting up the environment.
- **Verify before done** (`skills/verify-before-done/SKILL.md`): run before reporting any code change as complete. Mandatory.
