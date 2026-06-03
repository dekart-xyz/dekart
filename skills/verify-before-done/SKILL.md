---
name: verify-before-done
description: Use this skill before reporting code changes as complete to run repository verification checks and ensure no generated files were manually edited.
---

# Verify Before Done Skill

## Trigger

Use before reporting a code change as complete.

## Checklist

1. `go test ./...` passes for affected Go packages.
2. `npm test` passes for affected frontend code.
3. `npm run lint` passes for affected frontend code.
4. No generated files were edited manually.
5. When asked, behavior validated in the real runtime path (not just unit tests).
6. Any changed unit-test coverage protects meaningful behavior under the unit-test policy in `AGENTS.md`; it is not coverage-only, an implementation duplicate, or a trivial copied-text assertion.
7. Nothing in the change is unnecessary for the current scope.
