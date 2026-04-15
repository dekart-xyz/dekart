---
name: code-style
description: Use this skill when implementing or refactoring frontend/backend code in this repo and you need project-specific style rules for CSS modules, React render patterns, redundant checks, and protobuf usage.
---

# Code Style Skill

## Trigger

Use when editing code where style and pattern consistency matter (especially `src/client` and Go protobuf paths). Do not load for unrelated tasks like release notes, issue triage, or operational runbooks.

## CSS

- All component-specific styles must live in `*.module.css` files (CSS Modules).
- Use the `classnames` library to combine CSS classes dynamically in JSX, not manual string concatenation.
- Do not manually add browser prefixes (`-webkit-`, `-moz-`, `-ms-`, `-o-`). Autoprefixer handles this.

## React

- Do not create named functions (or anonymous functions assigned to constants) inside component render. Instead, define named functions with the `function` keyword in the component file.
- When appropriate, move reusable functions to `src/client/lib` or use hooks/new components.
- Anonymous functions not assigned to constants in render are OK.

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
