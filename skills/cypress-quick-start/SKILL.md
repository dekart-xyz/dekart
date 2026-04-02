# Cypress Quick Start Skill

## Trigger

Use this skill when asked to run Cypress tests in this repository.

## Quick Start

Run from repo root:

```bash
ELECTRON_RUN_AS_NODE= npx cypress run --spec "cypress/e2e/snowflake-s3/layerOrderRerunRegression.cy.js"
```

Why: this environment exports `ELECTRON_RUN_AS_NODE=1` by default, which prevents Cypress from starting. Prefixing with `ELECTRON_RUN_AS_NODE=` unsets it for the command.

## Common Commands

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
