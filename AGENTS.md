# Agent Rules

## Elegant Software Standard (Mandatory)

All coding work in this repo must follow an elegant-software approach:

- Solve the real problem in the simplest correct way.
- Prefer clarity over cleverness.
- Keep code and UX aligned with the real domain model.
- Avoid unnecessary abstractions, options, and moving parts.
- Keep architecture modular and consistent so change is easy.
- Keep user flows low-friction and obvious.

Decision heuristic:

- Pick the simplest solution that fully works and cannot be simplified further without breaking correctness.

Self-check before finalizing:

- Is anything in this change unnecessary for current scope?
- Can another engineer trace behavior quickly?
- Does structure match the domain?

## Consistency Rules (Mandatory)

- Follow existing project conventions before introducing new patterns.
- Prefer established libraries for standard concerns over custom implementations.
- Use canonical state, not ad-hoc component logic: before deriving behavior in components, check reducers/actions/selectors for an existing field and reuse it; if missing, add it once in the state layer (reducer/selector) and consume that everywhere.
- When extending a function that is already over 50 lines, refactor to keep functions under 50 lines using the smallest elegant extraction needed; preserve existing behavior and avoid broad rewrites.
- Add a short purpose description for each new function.
- For each non-trivial business-logic block (especially complex conditions), add a very short `why` comment.
- Do not use debug-level logging in production code paths.
- Keep test structure consistent with neighboring tests in the same folder.
- Match existing UI patterns and placement
- Validate behavior end-to-end in the real runtime path before finalizing.

## Skills (Mandatory)

- For release notes tasks, use [skills/release-notes/SKILL.md](/Users/vladi/dev/dekart/skills/release-notes/SKILL.md).
- For Cypress execution in this repo, use [skills/cypress-quick-start/SKILL.md](/Users/vladi/dev/dekart/skills/cypress-quick-start/SKILL.md).
