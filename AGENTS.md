# Agent Rules

Goal: contributions should blend into the existing codebase and minimize maintainer review iterations.

## Core Rule

- Make the smallest correct change that solves the task.
- Prefer existing patterns in the touched folder over introducing new patterns.
- Avoid speculative hardening. Add extra guards only for real, observed failure modes.

## Architecture Rules (mandatory)

- Proto is the source of truth for client/server contracts. Never edit generated proto files manually. Run `make proto`.
- Use gRPC (`dekart.proto`) for internal client-server communication by default.
- Use REST/MCP endpoints only for external API surfaces and large-payload flows.
- Business endpoint orchestration belongs in `src/server/dekart` methods on `Server` and is wired in `src/server/app/app.go`.
- Reusable domain logic belongs in `src/server/<domain>` packages and is called from `server/dekart`.
- Keep auth/workspace gates explicit at endpoint entry points (`user.GetClaims`, workspace checks).

## Cross-cutting Rules

- Add a short purpose comment for each new non-trivial function.
- Do not use debug logging in production paths. Keep logs high-signal for admins.
- Never force-push.

## Skill Usage

- Rule ownership: `AGENTS.md` owns policy/architecture rules; skills own detailed implementation conventions.
- Check `skills/README.md` first and use the matching skill before ad-hoc commands.
- For implementation/refactor tasks, use `skills/code-style/SKILL.md`.
- Before reporting code work complete, run `skills/verify-before-done/SKILL.md`.

## Skill Failure Recovery

When a skill/command fails:

1. Diagnose and retry with corrected inputs/flags.
2. If still broken, fall back to direct commands and complete the task.
3. Escalate only for missing credentials, destructive approval, or conflicting decisions.
