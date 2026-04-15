---
name: cypress-quick-start
description: Use this skill when running, debugging, reproducing, or validating Cypress E2E tests in this repo, including the required ELECTRON_RUN_AS_NODE override.
---

# Cypress Quick Start Skill

## Trigger

Use when asked to run, debug, reproduce, or verify Cypress E2E tests.

## Required Environment Detail

This environment often has `ELECTRON_RUN_AS_NODE=1` set globally. If not overridden, Cypress fails with `bad option: --no-sandbox` or `--smoke-test`. Always prefix commands with `ELECTRON_RUN_AS_NODE=`.

## Standard Workflow

1. Ensure you are in repo root.
2. If Cypress binary is missing: `npx cypress install`
3. Run the requested spec:
   - `ELECTRON_RUN_AS_NODE= npx cypress run --spec "<spec-path>"`
4. Report: pass/fail, failing assertion, artifact paths (video/screenshot).

## Canonical Commands

- Run one spec: `ELECTRON_RUN_AS_NODE= npx cypress run --spec "cypress/e2e/snowflake-s3/layerOrderRerunRegression.cy.js"`
- Run all Snowflake S3 specs: `ELECTRON_RUN_AS_NODE= npx cypress run --spec "cypress/e2e/snowflake-s3/*.cy.js"`
- Open interactive UI: `ELECTRON_RUN_AS_NODE= npx cypress open`

## Notes

- Base URL configured in `cypress.config.js` (`http://localhost:3000`).
- Layer-order regression spec: `cypress/e2e/snowflake-s3/layerOrderRerunRegression.cy.js`
