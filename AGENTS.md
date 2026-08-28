# Agent Rules

Goal: contributions should blend into the existing codebase and minimize maintainer review iterations.

## Core Rule

- Make the smallest correct change that solves the task.
- Implement the simplest architecture that satisfies the reproduced behavior, then stop.
- Prefer existing patterns in the touched folder over introducing new patterns.
- Avoid speculative hardening. Add extra guards only for real, observed failure modes.
- No new state, table, version, guard, RPC mode, or compatibility path without a failing test demonstrating why it is needed.

## Testing Rules
- Do not add tests merely to increase coverage.
- Do not duplicate implementation logic in tests.
- Prefer test-driven development using Cypress and unit tests.
- For every component that has UX or state (database, memory), use Cypress tests.
- Only use unit tests for stateless no UX components with no side effects (like schema validator)
- When a bug is found in production or QA, the fix must start with a failing regression test for the exact bad
tool input.
- MCP E2E tests must authenticate through the device flow (`POST /device`, browser authorization, then `POST /device/token`) and use the returned device token as the MCP bearer token. Do not call `/authenticate` directly or hand-roll OAuth/protobuf state helpers for MCP tests.
- For E2E tests, group specs by runtime configuration; split only long-running configurations into multiple parallel lanes.
- Cypress tests should verify what is visible to the user in the DOM, not internal or Redux state.



## Architecture Rules (mandatory)

- Proto is the source of truth for client/server contracts. Never edit generated proto files manually. Run `make proto`.
- Use gRPC (`dekart.proto`) for internal client-server communication by default.
- Use REST/MCP endpoints only for external API surfaces and large-payload flows.
- Preserve command/query separation. The client sends a gRPC command and receives versioned (`updated_at`) updates. Rely on simple deterministic reconciliation instead of duck typing or deep structural comparisons.
- Resolve races with versioned commands and deterministic reconciliation: a command carries the entity version observed by the client, the server applies it only if that version still matches, and the client reconciles or retries from newer canonical updates received through the server stream. Follow query-source CAS for conditional writes and report/dataset updated_at handling for stream reconciliation.
- Compare explicit versions or revision IDs; avoid deep structural comparisons and duck typing.
- Keep each RPC single-purpose: one operation, one responsibility. Do not introduce boolean mode switches that change command semantics.
- Business endpoint orchestration belongs in `src/server/dekart` methods on `Server` and is wired in `src/server/app/app.go`.
- Reusable domain logic belongs in `src/server/<domain>` packages and is called from `server/dekart`.
- Keep auth/workspace gates explicit at endpoint entry points (`user.GetClaims`, workspace checks).
- Avoid creating new states when current state machine can be re-used or extended.
- Don't introduce selectors, use reducers and react hooks.
- Use reducers or hooks when state normalization is needed (`isCloud`, `oidcEnabled`, etc.).

## Cross-cutting Rules

- Add a short purpose comment for each new non-trivial function and if statement
- Do not use debug logging in production paths. Keep logs high-signal for admins.
- Never force-push.
- Do not stage changes unless the user explicitly asks to stage, commit, or push.
- Commit and push changes only when the user explicitly asks to commit or push.
- Do not modify `.env*` files without explicit user permission, except example env files such as `.env.example`.
- Reuse existing contract types in the touched module (proto/shared schema) before adding local ad-hoc request structs; if you must diverge, add a one-line reason.
- Keep Cypress `cypress/e2e/<folder>` aligned with env config name used to run it (for example, `.env.local` -> `cypress/e2e/local`, `.env.pg-s3` -> `cypress/e2e/pg-s3`).
- After changing behavior, remove obsolete flags/params/branches that are no longer needed (no leftover transitional wiring).
- Do not introduce new environment variables in code/workflows without an explicit plan or direct user approval.
- Preserve comments that explain intent, race conditions, invariants, or non-obvious constraints. Remove comments only when they are obsolete.
- When a touched file exceeds 500 lines, assess whether it contains separable responsibilities. Extract cohesive functionality when it improves navigation and comprehension. Do not split solely to satisfy a line-count limit. Prefer modules of 150–300 lines, but prioritize cohesion.

## Skill Usage

- Rule ownership: `AGENTS.md` owns policy/architecture rules; skills own detailed implementation conventions.
- Check `skills/README.md` first and use the matching skill before ad-hoc commands.
- For implementation/refactor tasks, use `skills/code-style/SKILL.md`.
- Before reporting code work complete, run `skills/verify-before-done/SKILL.md`.
- For local frontend development, use `make client` so an existing Vite server on port 3000 is stopped before starting a fresh one.
- For local E2E tests, run local Postgres with `make up-and-down`, the backend with `make server <env-file>`, and the frontend with `make client`; do not rebuild Docker images unless explicitly validating the container/CI image.
- Keep the Cypress env file aligned with the spec folder: `.env.cloud` for `cypress/e2e/cloud`, `.env.googleoauth` for `cypress/e2e/google-oauth`, `.env.snowflake-s3` for `cypress/e2e/snowflake-s3`, and so on. Source `.env` before the lane env file when exporting variables for Cypress so lane-specific values win.
- Always run Cypress through `ELECTRON_RUN_AS_NODE= npx cypress ...` in local agent sessions.
- For local authenticated Cypress/dev-claim workflows, use an env file with `DEKART_DEV_CLAIMS=1` and set identity before visiting with `cy.setDevClaimsEmail(email)`.
- Use `DEV_REFRESH_TOKEN_INFO` and `DEV_REFRESH_TOKEN` only as Cypress/agent-side token inputs for tests that call `cy.stubGoogleOAuthToken(...)`; do not pass them to the server as a Dekart auth shortcut. Tests that do not call that helper do not need refresh tokens.
- When running `.env.googleoauth` against local Vite, set `DEKART_CORS_ORIGIN=http://localhost:3000` process-locally if the env file does not already set it.
- Cloud Cypress local proof command: run `make server .env.cloud`, run `make client`, export `.env` then `.env.cloud`, then run `ELECTRON_RUN_AS_NODE= npx cypress run --spec "cypress/e2e/cloud/*.cy.js"`.
– Start with fresh local database when needed via `make up-and-down` or `rm ./data/dekart.db` to avoid stale state issues.

## Skill Failure Recovery

When a skill/command fails:

1. Diagnose and retry with corrected inputs/flags.
2. If still broken, fall back to direct commands and complete the task.
3. Escalate only for missing credentials, destructive approval, or conflicting decisions.
