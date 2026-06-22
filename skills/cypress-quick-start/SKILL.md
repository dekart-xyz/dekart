---
name: cypress-quick-start
description: Use this skill when running, debugging, reproducing, or validating Cypress E2E tests in this repo, including the required ELECTRON_RUN_AS_NODE override.
---

# Cypress Quick Start Skill

## Trigger

Use when asked to run, debug, reproduce, or verify Cypress E2E tests.

## Required Environment Detail

This environment often has `ELECTRON_RUN_AS_NODE=1` set globally. If not overridden, Cypress fails with `bad option: --no-sandbox` or `--smoke-test`. Always prefix commands with `ELECTRON_RUN_AS_NODE=`.

Match the Cypress spec folder to its backend env file. Source `.env` before the lane env file when exporting variables for Cypress so the lane-specific values win:

```bash
set -a
. ./.env
. ./.env.cloud
set +a
```

Only specs that call `cy.stubGoogleOAuthToken(...)` need `DEV_REFRESH_TOKEN_INFO` or `DEV_REFRESH_TOKEN`. `DEV_REFRESH_TOKEN_INFO` must include only profile/email scopes; `DEV_REFRESH_TOKEN` must include BigQuery and storage scopes. Specs that use `cy.setDevClaimsEmail(...)` need the backend started with `DEKART_DEV_CLAIMS=1`, but they do not need Google refresh tokens unless they also stub OAuth.

## Standard Workflow

1. Ensure you are in repo root.
2. Start local Postgres with `make up-and-down`.
3. Start backend with the matching env file, for example `make server .env.cloud`.
4. Start the frontend with `make client`.
5. If Cypress binary is missing: `npx cypress install`
6. Run the requested spec:
   - `ELECTRON_RUN_AS_NODE= npx cypress run --spec "<spec-path>"`
7. Report: pass/fail, failing assertion, artifact paths (video/screenshot).

## Canonical Commands

- Run cloud specs:
  - backend: `make server .env.cloud`
  - env: `set -a; . ./.env; . ./.env.cloud; set +a`
  - Cypress: `ELECTRON_RUN_AS_NODE= npx cypress run --spec "cypress/e2e/cloud/*.cy.js"`
- Run Google OAuth specs against local Vite:
  - backend: `set -a; . ./.env; . ./.env.googleoauth; set +a; DEKART_CORS_ORIGIN=http://localhost:3000 go run ./src/server/main.go`
  - env: `set -a; . ./.env; . ./.env.googleoauth; set +a`
  - Cypress: `ELECTRON_RUN_AS_NODE= npx cypress run --spec "cypress/e2e/google-oauth/*.cy.js"`
- Run one spec: `ELECTRON_RUN_AS_NODE= npx cypress run --spec "cypress/e2e/snowflake-s3/layerOrderRerunRegression.cy.js"`
- Run all Snowflake S3 specs: `ELECTRON_RUN_AS_NODE= npx cypress run --spec "cypress/e2e/snowflake-s3/*.cy.js"`
- Open interactive UI: `ELECTRON_RUN_AS_NODE= npx cypress open`

## Notes

- Base URL configured in `cypress.config.js` (`http://localhost:3000`).
- Layer-order regression spec: `cypress/e2e/snowflake-s3/layerOrderRerunRegression.cy.js`
- Prefer local server instances (`make server ...`) for running local tests.
