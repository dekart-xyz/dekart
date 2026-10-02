# Skills Index

Use this file to pick the right local skill before running ad-hoc commands.

Rule ownership:
- `AGENTS.md` is the source of truth for policy and architecture.
- Skills are the source of truth for implementation details and workflows.

## Available Skills

- `dark-library` (`skills/dark-library/SKILL.md`)
  - Use when creating or changing anything under `src/client/dark/` or `src/server/dark/`, or when a new feature has self-contained logic/UI that can live there.
- `code-style` (`skills/code-style/SKILL.md`)
  - Use for implementation/refactor work to follow Dekart architecture, naming, style, and unit-test implementation conventions.
- `verify-before-done` (`skills/verify-before-done/SKILL.md`)
  - Mandatory before reporting code changes complete.
- `dev-runtime` (`skills/dev-runtime/SKILL.md`)
  - Use for local runtime setup/debug of backend/frontend.
- `cypress-quick-start` (`skills/cypress-quick-start/SKILL.md`)
  - Use for Cypress runs/debugging (`ELECTRON_RUN_AS_NODE=` override).
- `cypress-balance` (`skills/cypress-balance/SKILL.md`)
  - Manual only: invoke `$cypress-balance` to balance CI lanes and refactor overlapping Cypress coverage. Do not select automatically during ordinary test work.
- `release-notes` (`skills/release-notes/SKILL.md`)
  - Use when preparing release notes from commits/tags.

## Selection Rule

1. Choose the most specific matching skill for the task.
2. If task includes code changes, always include `code-style`.
3. Before finalizing code changes, always run `verify-before-done`.
