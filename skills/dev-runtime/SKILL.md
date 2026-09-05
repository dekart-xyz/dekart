---
name: dev-runtime
description: Use this skill when starting local development, setting up runtime dependencies, or debugging frontend/backend runtime issues in this repository.
---

# Dev Runtime Skill

## Trigger

Use when starting local development, debugging server/frontend issues, or setting up the dev environment.

## Commands

- `make up-and-down` runs local Postgres.
- `make server .env.cloud` runs backend with the selected env file.
- `make client` stops any existing listener on the clone's `DEKART_CLIENT_PORT` and starts Vite there.
- Configure a unique `COMPOSE_PROJECT_NAME` and host-local ports once in each clone's `.env` before running clones concurrently.
- `make compose-up PROFILE=<profile> ENV_FILE=<env-file>` runs any Compose profile with the clone-local resources from `.env`.
- `make proto` regenerates proto stubs. After running, restart backend and frontend.
