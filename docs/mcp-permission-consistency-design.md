# MCP Permission Consistency Design

## Goal

Make MCP authorization use the same capabilities as Dekart's existing gRPC/server methods, without adding a second MCP-specific Viewer/Editor policy.

The customer regression is a Viewer changing shared report map configuration through `update_report_map_config`. The fix must also make the permission behavior of every MCP endpoint explicit and testable for Viewers and Editors.

## Decision

MCP is a transport adapter. It must decode MCP arguments and call the same permission-bearing server operations used by gRPC, or reproduce the permission sequence of the corresponding gRPC method when MCP needs a distinct partial-update operation.

There will be no dispatcher-wide `Viewer` denial for all MCP tools.

For report-scoped operations, the report capability is authoritative:

- Read access: `getReport` returns the report in the caller's workspace/access context.
- Shared report mutation: `report.CanWrite` must be true.
- Query execution or preparation: `report.CanRefresh` must be true.
- Snapshot export: read access is sufficient.

`getReport` already makes `CanWrite` false for workspace Viewers. For Admins and Editors, `CanWrite` is true only when the caller is the report author or the report has `allow_edit` in the same workspace. Therefore, another workspace-role check would duplicate only part of the same decision and could disagree with gRPC behavior.

Workspace-level operations that have no report capability use their existing endpoint-specific role rule. For example, `CreateReport` allows Admins and Editors and denies Viewers.

## Orthogonal Read-Only Check

`requireWorkspaceWrite` independently enforces subscription/license state; `CanWrite` and `CanRefresh` authorize a user on a report. Each canonical server operation must own both checks it needs so MCP preserves its error ordering instead of applying a dispatcher-wide write check.

## Canonical Capability Matrix

| MCP tool | Scope | Canonical capability | Viewer | Editor |
| --- | --- | --- | --- | --- |
| `list_connections` | Workspace read | Existing connection visibility | Allowed | Allowed |
| `create_connection` | Disabled MCP operation | Always disabled | `FailedPrecondition` | `FailedPrecondition` |
| `create_report` | Workspace create | Existing `CreateReport` role rule | Denied | Allowed |
| `create_dataset` | Report structure | `CanWrite` | Denied | Allowed only with report edit access |
| `create_query` | Report structure | `CanWrite` through writable dataset lookup | Denied | Allowed only with report edit access |
| `update_query` | Report structure | `CanWrite` through writable query lookup | Denied | Allowed only with report edit access |
| `run_query` | Report refresh | `CanRefresh`; query definition changes still require `CanWrite` | Allowed in the same workspace | Allowed in the same workspace |
| `check_job_status` | Report read | Report read access | Allowed when report is readable | Allowed when report is readable |
| `remove_dataset` | Report structure | `CanWrite` through writable dataset lookup | Denied | Allowed only with report edit access |
| `create_file` | Report structure | `CanWrite` through writable dataset lookup | Denied | Allowed only with report edit access |
| `replace_file` | Report structure | `CanWrite` through writable dataset lookup | Denied | Allowed only with report edit access |
| `update_report_title` | Report structure | `CanWrite` | Denied | Allowed only with report edit access |
| `update_report_map_config` | Report structure | `CanWrite` | Denied | Allowed only with report edit access |
| `get_map_config_schema` | Stateless public metadata | None | Allowed | Allowed |
| `add_report_readme` | Report structure | `CanWrite` | Denied | Allowed only with report edit access |
| `update_report_readme` | Report structure | `CanWrite` | Denied | Allowed only with report edit access |
| `remove_report_readme` | Report structure | `CanWrite` | Denied | Allowed only with report edit access |
| `update_dataset_name` | Report structure | `CanWrite` through writable dataset lookup | Denied | Allowed only with report edit access |
| `get_report_properties` | Report read | Report read access | Allowed when report is readable | Allowed when report is readable |
| `create_report_snapshot` | Report export | Report read access | Allowed when report is readable | Allowed when report is readable |
| `start_file_upload_session` | Report structure | `CanWrite` through file-to-report lookup | Denied | Allowed only with report edit access |
| `complete_file_upload_session` | Report structure | `CanWrite` through file-to-report lookup | Denied | Allowed only with report edit access |
| `abort_file_upload_session` | Report structure | `CanWrite` through file-to-report lookup | Denied | Allowed only with report edit access |

## Current Inconsistencies

### MCP-only report updates

`callUpdateReportTitleTool` and `callUpdateReportMapConfigTool` use direct partial-update SQL with `(author_email = caller OR allow_edit) AND workspace_id`. Unlike gRPC `UpdateReport`, they do not first resolve the report and require `report.CanWrite`. A Viewer can therefore mutate an `allow_edit` report through MCP.

These MCP partial updates cannot safely call `UpdateReport`: reading the full report and writing it back would turn a single-field command into a read-modify-write operation that could overwrite concurrent changes. They should retain their partial SQL but perform the same authentication, report lookup, workspace read-only, and `CanWrite` checks as `UpdateReport` before persisting.

### Shared `CreateDataset` path

`CreateDataset` is used by both gRPC and MCP. Its insert SQL checks author/`allow_edit` and workspace, but it does not resolve `getReport` or require `CanWrite`. This gives a Viewer the same bypass through both transports. The shared method must require `CanWrite` before inserting so both gRPC and MCP become consistent.

### Query execution

`RunQuery` and DuckDB preparation intentionally use `CanRefresh`, not `CanWrite`. A same-workspace Viewer may execute the saved query, while `runQueryRequest` changes query text only when `CanWrite` is true. MCP must preserve this gRPC behavior. Treating every side-effecting MCP tool as an Editor-only mutation would incorrectly remove Viewer refresh capability.

### Dispatcher write classification

The dispatcher currently calls `requireWorkspaceWrite` before decoding any tool classified by `isMCPWriteTool`. This can mask canonical errors: disabled `create_connection` may return a read-only error instead of `FailedPrecondition`, malformed arguments may not reach validation, and read-only snapshot export is blocked even though its server operation requires only read access.

Every actual mutation already has, or will receive, its canonical read-only check. Remove the dispatcher check and `isMCPWriteTool` rather than maintaining a second operation taxonomy.

### MCP report-properties authentication

`callGetReportPropertiesTool` calls `getReport` without first requiring claims. `getReport` treats claims as an internal invariant, so an unauthenticated MCP request can terminate the server instead of returning `Unauthenticated`. The MCP endpoint must enforce identity at entry, consistently with other report reads.

### README workspace read-only checks

The shared README mutations call `requireWorkspaceWrite`, which checks the caller's selected workspace even when an author is accessing a report from another workspace. Removing the MCP dispatcher check exposes the same mismatch in the opposite direction. These report-scoped operations must call `requireReportWorkspaceWrite`, consistently with `UpdateReport` and the other report mutations.

## Error Semantics

MCP should expose the status produced by the canonical server permission path:

- unauthenticated caller to an operation that requires identity: `Unauthenticated` / HTTP 401;
- readable report without required write capability: `PermissionDenied` / HTTP 403;
- report or child resource not visible to the caller: `NotFound` / HTTP 404;
- subscription/license blocks persistence: `PermissionDenied` / HTTP 403 with the existing read-only message;
- disabled `create_connection`: `FailedPrecondition` / HTTP 412.

`get_map_config_schema` is intentionally callable without claims because it exposes only static public schema metadata.

The dispatcher must not mask argument-validation, unauthenticated, or resource-specific errors with a tool-name-based role error.

## Cypress Verification Design

Use the real MCP device flow for every identity: `POST /device`, browser authorization, `POST /device/token`, then the returned JWT as the bearer token.

Build valid resources rather than sending empty arguments, so each assertion reaches the intended permission check. Use isolated reports/datasets/files where a successful Editor call is destructive.

The spec must verify:

1. A Viewer cannot change dot color on an Editor-owned `allow_edit=true` report; map config, version, timestamp, and snapshots remain unchanged.
2. A Viewer who authored a report before being downgraded still cannot mutate its shared structure.
3. An Editor cannot mutate another Editor's `allow_edit=false` report.
4. An Editor can mutate another Editor's `allow_edit=true` report.
5. Every report-structure tool follows the same Viewer/Editor expectations using valid target resources.
6. `create_report` denies a Viewer and allows an Editor.
7. `run_query` permits a same-workspace Viewer to refresh the saved query without changing its definition.
8. All read tools allow both roles when the resource is readable.
9. `create_report_snapshot` remains available in a read-only workspace because it is an export, not a shared mutation.
10. Disabled `create_connection` returns the same 412 response for both roles.
11. Unauthenticated `get_map_config_schema` remains available, while identity-bearing operations retain their existing 401 behavior.

The test should assert persisted state for representative shared mutations and query-definition preservation, not only HTTP status. `/mcp/tools` inventory assertions should ensure every advertised endpoint appears in the matrix.

## Important Constraints

- Do not add an MCP-specific permission model or new role/capability type.
- Do not change `CanWrite` or `CanRefresh` definitions as part of this fix.
- Do not make Admin a universal override for reports that Admin cannot currently edit.
- Do not convert partial report updates into full `UpdateReport` writes.
- Do not add unit tests for the stateful permission behavior; Cypress is the regression layer.
- Do not change generated protobuf files or API contracts.
- Preserve current report non-disclosure behavior where a parent resource is not readable.

## Implementation Plan

1. Revise `cypress/e2e/local/mcpWorkspaceRoles.cy.js` into the capability matrix above and confirm the current Viewer map mutation and shared `CreateDataset` paths fail.
2. Add the `getReport`/`CanWrite` permission sequence used by `UpdateReport` to the MCP title and map-config partial-update handlers in `src/server/dekart/mcp.go`.
3. Make shared `CreateDataset` in `src/server/dekart/dataset.go` resolve the target report and require `CanWrite` before insertion.
4. Remove the dispatcher-wide `isMCPWriteTool`/`requireWorkspaceWrite` check, require claims at the report-properties endpoint, and make README mutations check the report's workspace; preserve `CanRefresh` query execution, public schema metadata, and read-access snapshot export.
5. Run the focused device-flow Cypress spec and affected Go/frontend static checks, then run the broader repository verification required by `AGENTS.md`.
