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
- `npm start` runs Vite dev server on `http://localhost:3000`.
- `make proto` regenerates proto stubs. After running, restart backend and frontend.
