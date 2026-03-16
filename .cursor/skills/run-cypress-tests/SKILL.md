---
name: run-cypress-tests
description: Run Cypress E2E specs in this repository with the correct environment override and troubleshooting steps. Use when the user asks to run, debug, reproduce, or verify Cypress tests.
---

# Run Cypress Tests

## When to Use

Use this skill for any request to run or debug Cypress E2E tests in this repo.

## Required Environment Detail

This environment often has `ELECTRON_RUN_AS_NODE=1` set globally.  
If not overridden, Cypress can fail to launch with errors like:

- `bad option: --no-sandbox`
- `bad option: --smoke-test`

Always run Cypress commands with `ELECTRON_RUN_AS_NODE=` prefix to unset it for that command.

## Standard Workflow

1. Ensure you are in repo root.
2. If Cypress binary is missing, run:
   - `npx cypress install`
3. Run the requested spec:
   - `ELECTRON_RUN_AS_NODE= npx cypress run --spec "<spec-path>"`
4. Report:
   - pass/fail status
   - failing assertion (if any)
   - artifact paths (video/screenshot) when failures happen

## Canonical Commands

Run specific spec:

```bash
ELECTRON_RUN_AS_NODE= npx cypress run --spec "cypress/e2e/snowflake-s3/layerOrderRerunRegression.cy.js"
```

Run all Snowflake S3 specs:

```bash
ELECTRON_RUN_AS_NODE= npx cypress run --spec "cypress/e2e/snowflake-s3/*.cy.js"
```

Open Cypress UI:

```bash
ELECTRON_RUN_AS_NODE= npx cypress open
```

## Notes for This Repo

- Base URL is configured in `cypress.config.js` (`http://localhost:3000`).
- Layer-order regression repro spec:
  - `cypress/e2e/snowflake-s3/layerOrderRerunRegression.cy.js`
