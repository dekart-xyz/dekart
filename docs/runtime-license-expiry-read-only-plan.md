# Runtime License Expiry Read-Only Plan

## Context

Dekart currently validates `DEKART_LICENSE_KEY` at startup. If a license key is required by the current setup and the key is missing, invalid, or expired, the server does not start. That behavior is correct and must stay.

The gap is runtime expiry. If a time-limited license is valid at startup and expires while the process keeps running, Dekart can continue accepting writes until the next restart. The business goal is simple: customers can still view existing work, but when a required license expires they should hit clear read-only behavior and contact Dekart to update the key.

## Current State

Verified on 2026-06-09.

| Area | Current behavior | Evidence |
| --- | --- | --- |
| Startup gate | `main()` validates the license before DB setup and server start | `src/server/main.go:254` |
| Required license conditions | License is required for enabled SSO modes and Postgres metadata | `src/server/app/licensecheck.go:24`, `src/server/app/licensecheck.go:58`, `src/server/app/licensecheck.go:65` |
| License env | `DEKART_LICENSE_KEY` is trimmed and validated when present | `src/server/app/licensecheck.go:44` |
| Expired startup token | Expired JWTs fail validation through `jwt.Parse` / `token.Valid` | `src/server/license/license.go:95`, `src/server/license/license_test.go:175` |
| Runtime read-only state | Workspace read-only is currently driven by subscription expiry | `src/server/dekart/subscription.go:37`, `src/server/dekart/workspace.go:537` |
| Workspace gate | `WorkspaceInfo` should expose the effective read-only state used by mutation guards | `src/server/user/workspace.go:21` |
| Default workspace | Default workspace uses fixed ID and existing workspace context | `src/server/user/workspace.go:56`, `src/server/dekart/workspace.go:482` |
| Client banner | UI reads workspace read-only state and shows the read-only banner | `src/client/reducers/workspaceReducer.js:21`, `src/client/WorkspaceReadOnlyBanner.jsx:10` |
| Header/share controls | Owner/editor controls are permission-driven through report state such as `canWrite` / `isAuthor` | `src/client/ReportHeaderButtons.jsx`, `src/client/ShareButton.jsx` |
| User stream | Workspace refresh is triggered by normal stream updates | `src/server/dekart/stream.go:388`, `src/client/actions/user.js:41` |
| MCP writes | MCP write paths already return read-only denial in some cases | `src/server/dekart/mcp.go:495`, `src/server/dekart/mcp.go:561` |

## Problem

There is no runtime license-expired state in the workspace/read-only model. License expiry is known only during startup validation. After startup, existing workspace checks only consider subscription expiry.

This means required-license deployments can continue writing after the license has expired, as long as the process is not restarted.

## Proposed Change

Add runtime license expiry as a separate read-only reason from subscription expiry.

When the current self-hosted setup requires a license and `now >= license exp`:

- All workspaces become read-only, including the default workspace.
- Read operations continue.
- Already-started query jobs may finish.
- New writes and new query runs/refreshes are blocked.
- Browser UI shows `License key expired` after the next `GetWorkspace` response, such as reload, navigation that refreshes workspace state, or an attempted mutation followed by refresh.
- The license-expired banner includes an `Extend Key` CTA to the Dekart Calendly link.
- MCP write calls return a clear reason that an agent can pass to the user.
- Production startup behavior remains unchanged.

Do not add:

- new product env vars,
- grace period,
- live `DEKART_LICENSE_KEY` reload,
- full renewal UI,
- background timer,
- scheduled stream ping.

Open browser sessions may learn about expiry on reload, navigation that refreshes workspace state, or an attempted mutation followed by refresh. Runtime expiry does not need to mutate `workspace_update`, add stream fields, or create a scheduled stream ping. Business correctness matters more than second-precision UI updates.

This change is for self-hosted required-license deployments. Cloud subscription behavior must not change, even when Cloud CI lanes pass a license key for other reasons.

## Runtime Behavior Contract

The spec does not require a specific storage location for parsed license metadata. The implementation may keep the startup license result on the app/server configuration if that is the smallest clean change.

The behavior contract is:

1. Reuse the current startup rules to know whether the setup requires a license, but apply runtime license-expiry read-only only when the deployment is self-hosted. Cloud deployments must never become runtime read-only because of `DEKART_LICENSE_KEY` expiry.
2. Preserve startup fatal behavior for missing, invalid, or expired required keys.
3. Preserve the parsed license `ExpiresAt` from the valid startup key when it exists.
4. Whenever Dekart evaluates workspace read-only state, derive license expiry from current time and the parsed expiry.
5. Compute one effective workspace read-only state in `SetWorkspaceContext`: `read_only = subscription.expired || licenseKeyExpired`.
6. Do not change report permission semantics such as `report.CanWrite` or `report.CanRefresh` solely because the workspace is read-only. Those fields should continue to describe normal ACL/ownership/sharing permission.
7. Keep the public proto/client contract focused on effective product state: expose whether the workspace is read-only and why.

## Proto and Client Contract

Do not overload `Subscription.expired`, because license expiry is not a subscription state.
Keep `Subscription.expired` as billing/plan state only. It remains an input into workspace read-only state, not the public product-state field clients should use for mutation behavior.

Append explicit workspace response fields to the existing `GetWorkspaceResponse`. Do not reorder existing fields.

```proto
message GetWorkspaceResponse {
    enum ReadOnlyReason {
        READ_ONLY_REASON_UNSPECIFIED = 0;
        READ_ONLY_REASON_SUBSCRIPTION_EXPIRED = 1;
        READ_ONLY_REASON_LICENSE_KEY_EXPIRED = 2;
    }
    Workspace workspace = 1;
    Subscription subscription = 2;
    repeated User users = 3;
    repeated WorkspaceInvite invites = 4;
    int64 added_users_count = 5;
    bool read_only = 6;
    ReadOnlyReason read_only_reason = 7;
}
```

`read_only_reason` should use stable enum values. Required values are `READ_ONLY_REASON_SUBSCRIPTION_EXPIRED` for billing/trial expiry and `READ_ONLY_REASON_LICENSE_KEY_EXPIRED` for runtime license expiry.

Reason precedence should prefer the most actionable/system-level block when multiple reasons apply. If `subscription.expired` and `licenseKeyExpired` are both true, return `READ_ONLY_REASON_LICENSE_KEY_EXPIRED`.

Client reducer behavior:

- Treat workspace as read-only when `read_only=true`.
- Render `License key expired` when `read_only_reason == READ_ONLY_REASON_LICENSE_KEY_EXPIRED`.
- Keep existing subscription/trial copy when `read_only_reason == READ_ONLY_REASON_SUBSCRIPTION_EXPIRED`.

Report permission and UI behavior:

- Do not redefine `report.CanWrite` for expired workspaces. `CanWrite` should mean the user has normal write permission by author/editor/share ACL.
- Do not make an author-owned report look like a viewer/public report because of license or subscription expiry.
- Users should see the same buttons and owner/editor layout they would normally see from their permissions.
- Mutation controls in that layout must be disabled when `workspace.readOnly=true`, with read-only copy such as `Workspace is read-only`.
- Client code should use an explicit mutation predicate such as `canMutate = report.canWrite && !workspace.readOnly` where a control performs a write.
- Read/inspect controls such as viewing share settings or copying links should remain available according to their existing permission rules.

## Server Enforcement

Runtime license expiry must affect the same server-side permissions as existing read-only workspaces.

Minimum required write families:

| Family | Expected behavior after runtime license expiry |
| --- | --- |
| Workspace | Rename and member changes are blocked |
| Reports | Create, fork, update, archive, restore, preview, sharing updates are blocked |
| Datasets | Create, rename, remove, connection updates are blocked |
| Queries | Create, update, run one, run all are blocked |
| Files | Create and replace file are blocked |
| Connections | Create, update, archive, set default are blocked |
| MCP | Write tools, README writes, and upload-session writes return a clear license-expired reason |

Every mutation endpoint must explicitly or indirectly check the effective `WorkspaceInfo.ReadOnly` state before mutating. Prefer endpoint-entry checks for write RPC/REST handlers so read-only state is enforced independently of report ACL fields.

Do not implement runtime expiry by forcing `report.CanWrite=false` or `report.CanRefresh=false` in report serialization. Those fields are permission facts; using them for commercial/runtime read-only state causes avoidable UI compensation and makes authors look like viewers.

Existing permission checks through `report.CanWrite` / `report.CanRefresh` should remain for ACL enforcement, but they are not sufficient for read-only workspace enforcement unless the endpoint also checks `WorkspaceInfo.ReadOnly`. Non-MCP write-family errors may keep existing read-only-equivalent error shapes. MCP should not return a vague generic message when the root cause is license expiry.

Implementation finding: not every mutation path is protected by `report.CanWrite`. Some paths insert or update directly after author/workspace SQL predicates, or use author-only checks such as `report.IsAuthor`. Those endpoints still need explicit expired-workspace gates so users cannot mutate after license expiry.

Add an explicit read-only-reason MCP pre-check so MCP write tools can return the license-expired message before falling into generic `CanWrite` / `CanRefresh` failures.

Suggested MCP error text:

```text
license key expired; update DEKART_LICENSE_KEY to edit this workspace
```

## Cypress Verification

Add a real Cypress spec and include it in GitHub Actions.

There are two distinct CI checks:

1. Startup failure with an already-expired required license. Use the GitHub Actions secret `DEKART_LICENSE_KEY_EXP` for this. This check should assert the server does not start when a required-license setup receives an expired key.
2. Expired-license read-only behavior with a dev-only startup bypass. Use the same already-expired secret plus `DEKART_DEV_ALLOW_EXPIRED_LICENSE_KEY_STARTUP=1` so the server can start while preserving the expired `exp` for runtime workspace state.

Use the existing `.github/workflows/e2e.yaml` matrix style. Add two targets next to `pg-s3-postgres`:

```yaml
- id: pg-s3-postgres-expired-license-startup
  spec: cypress/e2e/pg-s3/licenseExpiredReadOnly.cy.js
  expired_license_startup: true
  extra_env: |
    -e DEKART_LICENSE_KEY=$DEKART_LICENSE_KEY_EXP_SEC \
    ...

- id: pg-s3-postgres-expired-license-read-only
  spec: cypress/e2e/pg-s3/licenseExpiredReadOnly.cy.js
  expired_license_read_only: true
  extra_env: |
    -e DEKART_LICENSE_KEY=$DEKART_LICENSE_KEY_EXP_SEC \
    -e DEKART_DEV_ALLOW_EXPIRED_LICENSE_KEY_STARTUP=1 \
    -e CYPRESS_EXPIRED_LICENSE_STARTUP=1 \
    ...
```

Add a workflow preflight that fails clearly when `DEKART_LICENSE_KEY_EXP` is not configured. This avoids a confusing Docker/Cypress failure.

The dev-only bypass must ignore only expiry during startup validation. Signature, signing method, issuer, subject, and other non-expiry validation must still fail.

Containment rules for `DEKART_DEV_ALLOW_EXPIRED_LICENSE_KEY_STARTUP=1`:

- It is allowed only for CI/test lanes that intentionally need the server to start with an already-expired key.
- Do not document it as a product/runtime configuration option.
- Do not add it to Docker defaults, examples, install docs, or production deployment templates.
- When active, startup should log a clear warning that an expired key was accepted because the dev bypass was enabled.
- It must bypass only JWT expiry validation; malformed tokens, invalid signatures, wrong signing method, wrong issuer, empty subject, and other non-expiry validation failures remain fatal.

The Cypress test must verify:

1. Dekart starts in the read-only lane with an already-expired required license only when the dev bypass flag is present.
2. The browser shows `License key expired`.
3. The banner includes the `Extend Key` CTA pointing to the Dekart Calendly link.
4. One author mutation control is visible but disabled because `workspace.readOnly=true`.
5. One MCP write call returns a clear license-expired reason.

Do not keep a Cypress branch that creates work with a valid key, waits for the key to expire, then rechecks the report. The accepted CI model is the already-expired key plus dev startup bypass. Runtime transition behavior can be verified outside Cypress if implementation needs it.

The already-expired secret test must verify:

1. With Postgres metadata or SSO configured, `DEKART_LICENSE_KEY=${{ secrets.DEKART_LICENSE_KEY_EXP }}` prevents startup.
2. The failure message includes the existing startup license validation path, not a runtime read-only message.
3. This check does not run the browser Cypress assertions because the server is expected not to start.

## Acceptance Criteria

1. Missing required license still prevents startup.
2. Expired required license still prevents production startup; only the explicit CI/dev bypass may allow startup for read-only verification.
3. Valid time-limited required license allows startup before `exp`.
4. Once `now >= exp`, every self-hosted workspace is read-only, including the default workspace.
5. Existing reads still work after runtime license expiry.
6. Query jobs started before expiry may finish.
7. New query runs after expiry are blocked.
8. `GetWorkspace` exposes `read_only` and enum `read_only_reason` fields, with `read_only_reason=READ_ONLY_REASON_LICENSE_KEY_EXPIRED` for runtime license expiry and `READ_ONLY_REASON_SUBSCRIPTION_EXPIRED` for subscription/trial expiry.
9. Browser banner says `License key expired` after the next `GetWorkspace` response, such as reload or navigation that refreshes workspace state.
10. On the author’s own report, header buttons still use the author/owner layout after expiry because `report.CanWrite` remains permission-only, while save/fork/share mutation controls are disabled or read-only through `workspace.readOnly`.
11. Mutation endpoints, including dataset creation, workspace sharing, and direct access, are blocked server-side after expiry even for users who normally have write permission.
12. MCP write calls return a clear license-expired reason suitable for an agent to show the user.
13. GitHub Actions runs both the expired-key startup failure check and an expired-key read-only Cypress lane using the dev-only startup bypass flag.
14. No Cloud subscription behavior changes and no Cloud runtime license read-only behavior is introduced, even when Cloud uses Postgres metadata or receives `DEKART_LICENSE_KEY`.
15. No new product env var. The only new bypass flag is dev-only: `DEKART_DEV_ALLOW_EXPIRED_LICENSE_KEY_STARTUP=1`.

## Out Of Scope

- Full license renewal UI.
- Hot reload of a changed `DEKART_LICENSE_KEY`.
- Grace period.
- Cloud Stripe/subscription behavior changes.
- Blocking reads.
- Killing or cancelling already-running query jobs.
- Background timers or scheduled stream pings.

## Rollback Plan

Revert the PR. No data migration should be required beyond reverting proto-generated code.

## Effort Estimate

| Area | Estimate |
| --- | --- |
| Runtime license expiry wiring | 2 to 3 hours |
| Workspace context and server enforcement | 2 to 3 hours |
| Proto and generated files | 1 hour |
| Client banner/reducer update | 1 hour |
| MCP explicit error handling | 1 hour |
| Cypress spec and GitHub Actions lane | 3 to 5 hours |

## Resolved Implementation Decisions

1. `read_only` / `read_only_reason` are added only to `GetWorkspaceResponse`. Do not add stream fields or timers for this feature.
2. Non-MCP write-family errors may keep existing read-only-equivalent error shapes. MCP write calls need the explicit license-expired message.
3. Keep `report.CanWrite` permission-only. Do not set it to false only because a workspace/license/subscription expired.
4. Header/share UI should separate visibility from mutability: use existing permission state for visibility, and `workspace.readOnly` to disable mutation controls.
5. Server enforcement must not rely only on `report.CanWrite`; mutation endpoints need explicit read-only workspace checks where they can mutate after normal permission checks.
