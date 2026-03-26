# Agent Runbook

## Purpose

Fast instructions for agents working on this repo, especially for Cypress E2E runs.

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
- Can this be extended without major refactor?

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

Typical failure symptom when env override is missing:

- `Cypress.app/.../Cypress: bad option: --no-sandbox`

## Regression Spec Added

- Repro spec for layer order bug:
  - `cypress/e2e/snowflake-s3/layerOrderRerunRegression.cy.js`
- Current expected behavior (before bug fix):
  - spec fails with layer index mismatch assertion after Query 2 rerun.
