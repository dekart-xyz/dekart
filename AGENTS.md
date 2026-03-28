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
- Do not use debug-level logging in production code paths.
- Keep test structure consistent with neighboring tests in the same folder.
- Match existing UI patterns and placement
- Validate behavior end-to-end in the real runtime path before finalizing.

## Release Notes Skill (Mandatory when writing release notes)

When asked to produce release notes, follow this structure and filtering:

- Use `docs/release-notes-0-21-0.md` as the formatting template and section style baseline.
- Present items in this exact order:
  1. User-facing features first.
  2. Changes important for admins/operators second.
  3. User-facing bug fixes third.
  4. Upgrade instructions last.
- Skip chore/internal-only changes that do not affect users or admins (for example CI/workflow-only changes).
- Keep language outcome-focused (what changed for users/admins), not implementation-heavy.
- Include only changes in the requested version/tag diff range.

# Runbook

## Cypress Quick Start

Run from repo root:

```bash
ELECTRON_RUN_AS_NODE= npx cypress run --spec "cypress/e2e/snowflake-s3/layerOrderRerunRegression.cy.js"
```

Why: this environment exports `ELECTRON_RUN_AS_NODE=1` by default, which prevents Cypress from starting. Prefixing with `ELECTRON_RUN_AS_NODE=` unsets it for the command.

## Common Cypress Commands

- Run one spec:
  - `ELECTRON_RUN_AS_NODE= npx cypress run --spec "cypress/e2e/snowflake-s3/layerOrderRerunRegression.cy.js"`
- Run all Snowflake S3 specs:
  - `ELECTRON_RUN_AS_NODE= npx cypress run --spec "cypress/e2e/snowflake-s3/*.cy.js"`
- Open interactive Cypress app:
  - `ELECTRON_RUN_AS_NODE= npx cypress open`

## If Cypress Fails To Start

1. Install Cypress binary:
   - `npx cypress install`
2. Re-run with env override:
   - `ELECTRON_RUN_AS_NODE= npx cypress run --spec "<spec-path>"`


