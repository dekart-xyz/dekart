# No-Config Snapshot Endpoint Plan

## Problem

Running Dekart locally with no Browserless configuration currently disables the whole snapshot flow.

Observed behavior:
- `create_report_snapshot` can return `FailedPrecondition`.
- MCP/HTTP clients see `412` with `snapshot feature is disabled`.
- The failure happens because `reportsnapshot.IsEnabled()` means `DEKART_BROWSERLESS_TOKEN` is configured.

Expected behavior:
- Remote PNG capture stays disabled when Browserless is not configured.
- Snapshot token issuance and render URL generation stay enabled.
- Local clients can use `snapshot_render_url` to open the report snapshot page.
- `snapshot_url` is empty when PNG capture is unavailable.

## Current Control Flow

1. MCP calls `create_report_snapshot`.
2. `src/server/dekart/mcp.go` dispatches to `CreateReportSnapshot`.
3. `src/server/dekart/snapshot.go` checks `reportsnapshot.IsEnabled()`.
4. `src/server/reportsnapshot/browserless.go` returns false when `DEKART_BROWSERLESS_TOKEN` is empty.
5. gRPC returns `FailedPrecondition`, which maps to HTTP `412`.

The issue is that one guard currently represents two different concepts:
- snapshot endpoint/token availability
- Browserless PNG capture availability

## Implementation Plan

### 1. Rename the Browserless gate

File: `src/server/reportsnapshot/browserless.go`

Rename `IsEnabled()` to a capture-specific helper such as `IsCaptureEnabled()`.

Keep the implementation unchanged:
- true when `DEKART_BROWSERLESS_TOKEN` is configured
- false when it is empty

Update `StreamImage` to use the renamed helper.

### 2. Enable snapshot token issuance without Browserless

File: `src/server/dekart/snapshot.go`

In `CreateReportSnapshot`, remove the Browserless precondition.

Keep existing gates:
- `user.GetClaims(ctx)`
- `validateSnapshotRequest(req)`
- `s.ensureReportReadAccess(ctx, req.GetReportId())`
- `reportsnapshot.IssueToken(...)`

Return the existing response fields:
- `snapshot_render_url`
- `expires_in`

Set `snapshot_url` only when Browserless PNG capture is enabled:
- Browserless enabled: `snapshot_url = /snapshot/report/{token}.png`
- Browserless disabled: `snapshot_url = ""`

This avoids returning a PNG URL that is known to fail in no-config local mode.

Do not change proto fields for this fix. Update the `snapshot_url` comment in `proto/dekart.proto` so the contract says it can be empty when PNG capture is unavailable, then run `make proto` only if that comment change updates generated artifacts in this repo. Add a capability field only if a future client needs explicit branching.

### 3. Keep PNG capture disabled without Browserless

File: `src/server/dekart/snapshot.go`

In `HandleSnapshotReport`, keep the capture guard.

When Browserless is not configured, keep the current behavior:
- response: `404`
- body: `snapshot feature is disabled`

This is the smallest behavior change because the PNG route remains unavailable exactly as it is today.

### 4. Always expose the MCP tool

File: `src/server/dekart/mcp.go`

Always include `create_report_snapshot` in `mcpToolDefinitions()`.

Update tool wording so it does not promise PNG capture in no-config local mode.

Suggested wording:
- Description: `Create a short-lived report snapshot render URL. The PNG snapshot URL is returned only when Browserless capture is configured.`
- When to use: `Use after map updates when you need a render URL, or a PNG snapshot URL when available.`

## Tests

Add focused backend coverage:

1. MCP tool visibility
   - `DEKART_BROWSERLESS_TOKEN` unset
   - `create_report_snapshot` is still listed

2. Snapshot RPC without Browserless
   - `DEKART_BROWSERLESS_TOKEN` unset
   - authenticated workspace context
   - report access succeeds
   - `CreateReportSnapshot` returns empty `snapshot_url`
   - `CreateReportSnapshot` returns non-empty `snapshot_render_url`
   - `CreateReportSnapshot` returns positive `expires_in`

3. Snapshot RPC with Browserless
   - `DEKART_BROWSERLESS_TOKEN` set
   - authenticated workspace context
   - report access succeeds
   - `CreateReportSnapshot` returns non-empty `snapshot_url`
   - `CreateReportSnapshot` returns non-empty `snapshot_render_url`
   - `CreateReportSnapshot` returns positive `expires_in`

4. PNG route without Browserless
   - `DEKART_BROWSERLESS_TOKEN` unset
   - `/snapshot/report/{token}.png` still returns `404`
   - response still indicates snapshot feature is disabled

5. Existing gates
   - unauthenticated `CreateReportSnapshot` still fails
   - missing or inaccessible report still fails
   - removing the capture guard must not weaken report access checks

6. Optional capture guard test
   - only add if the renamed guard remains exported
   - unset token -> false
   - set token -> true

## Non-Goals

- No proto field changes.
- No generated proto edits by hand.
- No new environment variables.
- No Browserless fallback renderer.
- No change to token storage.
- No change to the current PNG route disabled status code.

If proto field changes become necessary later, edit `proto/dekart.proto` only and run `make proto`; do not edit generated proto files manually.

## Review Notes

- This keeps remote PNG capture disabled without `DEKART_BROWSERLESS_TOKEN`.
- This fixes local no-config MCP usage by allowing snapshot token and render URL creation.
- Empty `snapshot_url` is the disabled PNG-capture signal for this fix.
- The `snapshot_url` proto comment should describe this empty-string behavior so the contract stays explicit without adding a new field.
- `snapshot_render_url` remains populated in both Browserless-enabled and Browserless-disabled modes.
- Snapshot tokens remain in-memory and short-lived. This is acceptable for the current local no-config use case.
- MCP wording must stay precise so agents do not assume PNG capture works without Browserless.
- After renaming the guard, only Browserless PNG capture paths should call `IsCaptureEnabled()`.

## Optional Future Proto Field

If clients need an explicit capability bit instead of checking `snapshot_url == ""`, add a proto field after this fix.

Preferred names:
- `png_capture_enabled`
- `snapshot_image_enabled`

Avoid `remote_render_enabled` because `snapshot_render_url` still works without Browserless; the disabled capability is PNG image capture, not render-page access.
