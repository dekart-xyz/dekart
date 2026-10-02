---
name: cypress-balance
description: Manually invoked Cypress maintenance to balance CI matrix lanes and refactor overlapping test coverage. Use only when the user explicitly invokes this skill.
---

# Cypress Balance

## Invocation

Run only when explicitly invoked by the user as `$cypress-balance` or by this skill's name or path. Adding or editing Cypress tests does not activate it.

Read `AGENTS.md` and respect the user's requested scope. If no subset is specified, inspect the Cypress matrix and suite for balancing and overlapping coverage.

## Workflow

1. Inspect `.github/workflows/e2e.yaml`, the assigned specs, and their runtime prerequisites. Identify missing or repeated matrix assignments, allowing deliberate coverage of distinct configurations.
2. Read recent successful GitHub Actions job timings and, where needed, per-spec timings from logs using read-only `gh` commands. Compare the test execution steps rather than queue or image setup time. Use local timings when CI evidence is unavailable and label estimates clearly.
3. Compare scenarios by the regression they catch, preconditions, action, and visible outcome. Similar setup alone is not duplicate coverage. Preserve distinct empty-result, loaded-result, save, and stream-update cases where they exercise different behavior.
4. Consolidate overlapping scenarios into existing tests when their unique assertions can be retained. Share substantial repeated setup only when it reduces duplication without coupling tests or hiding their intent. Keep tests independently runnable.
5. Reassign specs among compatible runtime lanes using measured durations to reduce the longest lane. Keep connector, auth, storage, license, billing, and credential prerequisites intact. Split only long-running configurations; do not add lanes merely to equalize test counts. Assign each affected spec once per intended configuration.
6. Run affected specs through [cypress-quick-start](../cypress-quick-start/SKILL.md), using the matching backend configuration. Check workflow YAML, matrix assignments, and applicable lint. Follow [verify-before-done](../verify-before-done/SKILL.md).

## Result

Report retained regression coverage, removed overlap, lane assignments, measured versus estimated timing changes, and verification with video links. Actual CI wall-time improvement requires a subsequent CI run; do not claim it from local timings alone.

Keep this workflow opt-in. Do not add balancing or refactoring mandates to default agent rules, and do not stage, commit, push, or trigger CI without the user's explicit authorization.
