---
name: cypress-quick-start
description: Use this skill when running, debugging, reproducing, or validating Cypress E2E tests in this repo, including the required ELECTRON_RUN_AS_NODE override.
---

# Cypress Quick Start Skill

## Trigger

Use when asked to run, debug, reproduce, or verify Cypress E2E tests.

## Required Environment Detail

This environment often has `ELECTRON_RUN_AS_NODE=1` set globally. If not overridden, Cypress fails with `bad option: --no-sandbox` or `--smoke-test`. The Make targets clear it for Cypress.

Match the Cypress spec folder to its backend env file. Use the Make targets so lane settings load normally and only clone-local resources from `.env` take precedence:

```bash
make cypress-run ENV_FILE=.env.cloud SPEC="cypress/e2e/cloud/*.cy.js"
```

Only specs that call `cy.stubGoogleOAuthToken(...)` need `DEV_REFRESH_TOKEN_INFO` or `DEV_REFRESH_TOKEN`. `DEV_REFRESH_TOKEN_INFO` must include only profile/email scopes; `DEV_REFRESH_TOKEN` must include BigQuery and storage scopes. Specs that use `cy.setDevClaimsEmail(...)` need the backend started with `DEKART_DEV_CLAIMS=1`, but they do not need Google refresh tokens unless they also stub OAuth.

## Standard Workflow

1. Ensure you are in repo root.
2. Start local Postgres with `make up-and-down`.
3. Start backend with the matching env file, for example `make server .env.cloud`.
4. Start the frontend with `make client`.
5. If Cypress binary is missing: `npx cypress install`
6. Run the requested spec:
   - `make cypress-run ENV_FILE=<env-file> SPEC="<spec-path>"`
7. Report: pass/fail, failing assertion, artifact paths (video/screenshot).

## Output Discipline

Cypress output is large, and everything printed stays in the agent's context for the rest of the thread. Send the full output to a log file and read only what explains the result.

```bash
LOG=/tmp/cy-$(date +%H%M%S).log
make cypress-run ENV_FILE=<env-file> SPEC="<spec-path>" CYPRESS_ARGS="--quiet --reporter dot" > "$LOG" 2>&1; echo "exit=$?"
grep -n -E "passing|failing|pending|^ +[0-9]+\) |Error|Timed out|expected .* to |Can't resolve|uncaught" "$LOG" | head -40
tail -25 "$LOG"; echo "log: $LOG"
```

- Run it in the foreground with a timeout long enough for the spec. Do not start a run in the background and end the turn to wait for it.
- Nothing is hidden. If the summary does not explain the failure, open the log around the failing test with `sed -n '<from>,<to>p' "$LOG"`. Do not guess from a partial view, and do not `cat` the whole log.
- On a rerun of a failure already understood, the exit code and the passing/failing counts are enough.
- Open a screenshot only when the assertion text and the log do not explain the failure. Never read videos.
- CI logs follow the same rule: `gh run view <run> --job <job> --log-failed > "$LOG"`, then the same grep and tail.

## Canonical Commands

- Run cloud specs:
  - backend: `make server .env.cloud`
  - Cypress: `make cypress-run ENV_FILE=.env.cloud SPEC="cypress/e2e/cloud/*.cy.js"`
- Run Google OAuth specs against local Vite:
  - backend: `make server .env.googleoauth`
  - Cypress: `make cypress-run ENV_FILE=.env.googleoauth SPEC="cypress/e2e/google-oauth/*.cy.js"`
- Run one spec: `make cypress-run ENV_FILE=.env.snowflake-s3 SPEC="cypress/e2e/snowflake-s3/layerOrderRerunRegression.cy.js"`
- Run all Snowflake S3 specs: `make cypress-run ENV_FILE=.env.snowflake-s3 SPEC="cypress/e2e/snowflake-s3/*.cy.js"`
- Open interactive UI: `make cypress-open ENV_FILE=<env-file>`

## Notes

- Base and API URLs are derived in `cypress.config.js` from the clone-local ports in `.env`.
- Layer-order regression spec: `cypress/e2e/snowflake-s3/layerOrderRerunRegression.cy.js`
- Prefer local server instances (`make server ...`) for running local tests.
