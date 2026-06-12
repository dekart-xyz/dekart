# MCP invalid ID postmortem

Date: 2026-06-12
Branch analyzed: `fix-mcp-uuid-issue` at `8cb951e`
Incident source: QA reproduced production behavior from Cloud logs.

## Summary

MCP query tools could return Internal errors when an agent sent an empty or
malformed `dataset_id` or `query_id`. The bad input reached Postgres UUID
comparisons before endpoint validation, producing errors like:

```text
pq: invalid input syntax for type uuid: ""
```

Affected MCP tools:

- `create_query`, via `dataset_id`
- `update_query`, via `query_id`
- `run_query`, via `query_id`

## User impact

Current Dekart Cloud users using agents could see tool calls fail as server
errors instead of clear client-input errors. The agent cannot reliably correct
itself when Dekart returns a database error rather than `InvalidArgument` with a
specific field message.

## Timeline

- 2026-06-11 05:54: production log review recorded one smaller MCP empty-UUID
  bug alongside larger token and BigQuery noise.
- 2026-06-11 11:32, `3b61854`: MCP readme/file persistence work shipped with
  focused tests for that behavior.
- 2026-06-11 14:45, `a0f2828`: MCP BigQuery service-account validation changed
  `create_query`, `update_query`, and `run_query` orchestration, and added a
  focused Cypress test for BigQuery passthrough rejection.
- 2026-06-11 17:29, `8cb951e`: MCP Cypress auth was updated to device flow and
  documented in `AGENTS.md`.
- 2026-06-12 04:39: QA reproduced the production behavior: empty IDs still
  reached database UUID parsing in MCP query flows.

## Current technical state

`CreateDataset` validates `report_id` before DB access. The query methods did
not have equivalent pre-DB validation:

| Tool | Field | Current path | Gap |
|------|-------|--------------|-----|
| `create_query` | `dataset_id` | `src/server/dekart/query.go` calls `getReportID` | Raw input reaches `datasets.id = $1` and legacy `queries.id = $1` |
| `update_query` | `query_id` | `src/server/dekart/query.go` calls `query.GetQueryDetails` | Raw input reaches `queries.id = $1` |
| `run_query` | `query_id` | `src/server/dekart/query.go` calls `query.GetQueryDetails` | Raw input reaches `queries.id = $1` |

## 5 Whys

1. Why did users see Internal MCP failures?
   Because empty or malformed IDs were passed into Postgres UUID comparisons,
   causing `pq: invalid input syntax for type uuid: ""`.

2. Why did bad IDs reach Postgres?
   Because `createQuery`, `updateQuery`, and `runQueryRequest` trusted decoded
   proto fields and called DB lookup helpers before validating ID presence and
   UUID format.

3. Why did the MCP work not catch this?
   The tests added around this area validated the intended happy and policy
   paths: BigQuery service-account gating, device-flow auth, readme behavior,
   and legacy missing query source handling. They did not include malformed MCP
   tool arguments.

4. Why were malformed arguments not part of the test checklist?
   The MCP feature work treated tool input shape as covered by proto decoding
   and schema definitions. That catches wrong JSON types, but not empty strings
   or syntactically invalid UUID strings.

5. Why did this reach production?
   The production log signal was classified as a small empty-UUID bug among
   larger alert noise, and no rule required production-observed MCP failures to
   become red-first Cypress regressions before nearby MCP work continued.

Root cause: MCP endpoint changes lacked a required invalid-argument regression
loop for agent-provided IDs, especially for empty strings that are valid JSON and
valid proto strings but invalid UUIDs.

## What worked

- Production log review found the issue class.
- MCP auth test rules were improved after the `/authenticate` shortcut was
  noticed.
- Existing Cypress MCP device-flow coverage gives a good place to add the
  regression.
- The gRPC-backed MCP design means one server-side validation fix can protect
  both MCP and direct callers.

## What failed

- The empty-UUID production signal did not become a tracked acceptance criterion
  immediately.
- Nearby MCP tests were policy-specific and did not include malformed agent
  argument tests.
- Code review did not require "empty string is still user input" validation for
  UUID fields before DB calls.
- Agent instructions said how to authenticate MCP E2E tests, but not when a
  production MCP error demands Cypress regression coverage.

## Preventive actions

### Software

1. Add red-first Cypress coverage for empty and malformed IDs in the existing
   Google OAuth MCP spec.
2. Validate `dataset_id` and `query_id` before DB lookup in the reused gRPC
   methods, not only in MCP wrappers.
3. Return agent-clear `InvalidArgument` messages:
   - `dataset_id is required`
   - `invalid dataset_id format`
   - `query_id is required`
   - `invalid query_id format`
4. Keep valid-but-missing UUIDs as `NotFound`.

### Agent docs

Add an `AGENTS.md` rule: when a bug is reproduced from production or QA logs in
an MCP tool, the fix must start with a failing regression test for the exact bad
tool input. If the bug was observed through MCP, prefer Cypress coverage through
the device-flow MCP endpoint. Put shared validation in the reused gRPC method
when MCP calls reuse that method.

## Non-goals

- Broad UUID validation audit across unrelated endpoints.
- Schema or migration changes.
- Changing MCP schema definitions unless needed by the fix.
- Changing `NotFound` semantics for valid UUIDs that do not exist.
