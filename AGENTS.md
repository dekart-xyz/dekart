# Agent Rules

## Elegant Software Standard

- Solve the real problem in the simplest correct way.
- Prefer clarity over cleverness.
- Keep code and UX aligned with the real domain model.
- Avoid unnecessary abstractions, options, and moving parts.
- Keep architecture modular and consistent so change is easy.
- Keep user flows low-friction and obvious.

Decision heuristic: pick the simplest solution that fully works and cannot be simplified further without breaking correctness.

## Hard Rules

- Follow existing project conventions before introducing new patterns.
- Use canonical state, not ad-hoc component logic: check reducers/actions/selectors for an existing field before deriving behavior in components. If missing, add it once in the state layer.
- Never edit generated files manually. Regenerate with `make proto`.
- Never force-push. Never drop or destructively alter migrations without explicit approval.
- When extending a function over 50 lines, refactor to keep functions under 50 lines using the smallest extraction needed.

## Style Rules

- Prefer established libraries for standard concerns over custom implementations.
- Add a short purpose description for each new function.
- For non-trivial business-logic blocks (especially complex conditions), add a very short `why` comment.
- Do not use debug-level logging in production code paths.
- Keep test structure consistent with neighboring tests in the same folder.
- Match existing UI patterns and placement.

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
