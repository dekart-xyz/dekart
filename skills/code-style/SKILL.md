---
name: code-style
description: Use this skill when implementing/refactoring frontend/backend code and you need Dekart-specific conventions for naming, code organization, architecture boundaries, and style consistency.
---

# Code Style Skill

## Trigger

Use when editing code where consistency with existing Dekart patterns matters (especially `src/client`, `src/server/dekart`, and `src/server/*` domain packages). Do not load for non-code tasks.

Policy/architecture guardrails are defined in `AGENTS.md`. This skill is the source of truth for implementation conventions.

## Backend Conventions

- Go file names are short lowercase, no snake case except `_test.go`.
- Keep `context.Context` as first function argument for server/domain methods.
- Use `HandleX` names for HTTP wrappers that bridge transport -> existing server method.
- Return typed gRPC status errors from endpoint business logic.
- Keep auth/workspace gating explicit near method start (`user.GetClaims`, workspace checks).
- Add short rationale comments before non-trivial conditional business logic.

## CSS

- All component-specific styles must live in `*.module.css` files (CSS Modules).
- Use the `classnames` library to combine CSS classes dynamically in JSX, not manual string concatenation.
- Do not manually add browser prefixes (`-webkit-`, `-moz-`, `-ms-`, `-o-`). Autoprefixer handles this.

## Frontend Conventions

- Component files use `PascalCase.jsx`; component styles use matching `PascalCase.module.css`.
- Non-component frontend files use `camelCase.js` (actions, reducers, lib hooks/utils).
- Keep shared application state in Redux.
- Keep side effects/network calls in actions/thunks, not reducers.
- Keep reducers pure and action-driven.
- Keep reusable non-UI logic in `src/client/lib`.
- Prefer Ant Design components for UI by default.

## Redundant Checks

Do not add checks for conditions already guaranteed by code structure or calling context.

Remove checks when:
- A value is always provided by the constructor/factory/initialization.
- Project structure makes only one option valid.
- A value is already validated earlier in the call chain or by middleware.
- Configuration enforces a specific value.

Keep checks for: user input, environment variables, runtime variations, cross-platform paths, optional features.

## Protobuf

- Never handle both protobuf objects and plain objects. Pick one representation.
- If a proto schema defines a property, it's always defined. Access it directly.
  - Bad: `if proto.Message != nil { ... }` when `Message` is in the schema.
  - Good: `proto.Message.Field` directly.
- Only check optional fields, oneof fields, or empty repeated fields (when length matters).

## Change Shape Guidance

- Prefer small, surgical edits over broad refactors unless refactor is required for correctness.
- Keep patterns consistent with neighboring code in the same folder.
