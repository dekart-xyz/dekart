# Skills Index

Use this file to pick the right local skill before running ad-hoc commands.

Rule ownership:
- `AGENTS.md` is the source of truth for policy and architecture.
- Skills are the source of truth for implementation details and workflows.

## Available Skills

- `code-style` (`skills/code-style/SKILL.md`)
  - Use for implementation/refactor work to follow Dekart architecture, naming, and style conventions.
- `verify-before-done` (`skills/verify-before-done/SKILL.md`)
  - Mandatory before reporting code changes complete.
- `dev-runtime` (`skills/dev-runtime/SKILL.md`)
  - Use for local runtime setup/debug of backend/frontend.
- `cypress-quick-start` (`skills/cypress-quick-start/SKILL.md`)
  - Use for Cypress runs/debugging (`ELECTRON_RUN_AS_NODE=` override).
- `release-notes` (`skills/release-notes/SKILL.md`)
  - Use when preparing release notes from commits/tags.

## Selection Rule

1. Choose the most specific matching skill for the task.
2. If task includes code changes, always include `code-style`.
3. Before finalizing code changes, always run `verify-before-done`.
