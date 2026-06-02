# Default Workspace Management Parity Plan

## Goal

Make the self-hosted default workspace behave like a user-created self-hosted workspace for management flows.

Target outcome:
- The default workspace can be opened from the workspace UI.
- Admins can rename it, view members, update roles, remove users, manage tokens, and use the same workspace endpoints as user-created self-hosted workspaces.
- The fixed default workspace remains `00000000-0000-0000-0000-000000000000`.
- Cloud workspace onboarding and billing behavior stay unchanged.

## Current Behavior

- `.env.local` does not set `DEKART_ALLOW_WORKSPACE_CREATION`, so self-hosted local mode cannot create workspaces by default.
- `CanCreateWorkspace()` returns true for Cloud and false for self-hosted unless `DEKART_ALLOW_WORKSPACE_CREATION` is set.
- When workspace creation is disabled, `getUserWorkspaces` and `getUserWorkspace` auto-add authenticated users to the fixed default workspace.
- The default workspace already exists in Postgres and SQLite migrations with `is_default = true`.
- `workspaces.is_default` is currently dead state. Runtime default detection is mostly by special-case context, not by reading this column.
- In auth-disabled self-hosted mode, `SetWorkspaceContext` creates a synthetic admin default workspace context instead of loading the DB-backed workspace, subscription, users, and counts.
- `UpdateWorkspace` and `UpdateWorkspaceUser` already work for any workspace if the current workspace exists, is not expired, and the user role is admin.
- `CreateWorkspace` does not enforce `CanCreateWorkspace()` server-side, so disabled workspace creation is currently a UI convention.
- `WorkspaceSelector` disables "Manage Workspace" when auth is disabled, even though the server grants admin context to auth-disabled self-hosted default users.

## Product Decisions

1. Treat the default workspace as a real workspace, not a lightweight fallback.
2. Preserve `is_default_workspace` as a signal for UI copy and policy, but do not use it to block normal workspace management.
3. Keep Cloud behavior unchanged.
4. Enforce self-hosted workspace creation policy on the backend.
5. Auth-disabled member management needs an explicit identity policy:
   - Default: allow rename and token management, but block invite/member role changes when the current user is `UNKNOWN_EMAIL`.
   - Enforce that block in `UpdateWorkspaceUser`; UI hiding alone is not enough because direct gRPC calls would otherwise still work.
   - Auth-enabled self-hosted: allow full member management for admins.

## Implementation Plan

### Phase 1: Normalize Default Workspace Bootstrap

Server files:
- `src/server/dekart/workspace.go`
- `src/server/user/workspace.go`
- `src/server/dekart/subscription.go`

Steps:
1. Add a small helper that ensures the fixed default workspace exists with a default subscription.
2. Reuse that helper from both authenticated and auth-disabled self-hosted paths.
3. Keep the current default workspace ID and name.
4. Avoid duplicate subscription rows when the default subscription already exists.
5. Keep `DEKART_DEFAULT_WORKSPACE_ADMIN` and `DEKART_DEFAULT_WORKSPACE_ROLE` behavior for authenticated self-hosted users.

Expected result:
- Default workspace bootstrap uses the same persisted tables as user-created workspaces: `workspaces`, `workspace_log`, and `subscription_log`.

### Phase 2: Load Default Workspace Context From DB

Server files:
- `src/server/dekart/workspace.go`
- `src/server/dekart/stream.go`

Steps:
1. Extend workspace queries to return whether a workspace is default.
   - Prefer `workspaces.is_default`.
   - Also compare to `user.GetDefaultWorkspaceID()` as a fallback for older or repaired data.
2. Set `WorkspaceInfo.IsDefaultWorkspace` consistently for authenticated users.
3. Replace the auth-disabled synthetic context with a DB-backed context where possible:
   - workspace ID
   - workspace name
   - plan type
   - active user counts
   - billed user counts
   - default/admin role
   - `IsDefaultWorkspace`
4. Keep auth-disabled self-hosted writable for local use, but do not invent member identities beyond `UNKNOWN_EMAIL`.

Expected result:
- `GetUserStreamResponse.is_default_workspace` is reliable.
- User stream, workspace page, token flows, and workspace endpoints see the same context shape for default and user-created self-hosted workspaces.

### Phase 3: Enforce Workspace Creation Policy Server-Side

Server file:
- `src/server/dekart/workspace.go`

Steps:
1. Add a `user.CanCreateWorkspace()` check to `CreateWorkspace`.
2. Return `PermissionDenied` when self-hosted workspace creation is disabled.
3. Keep Cloud and explicit `DEKART_ALLOW_WORKSPACE_CREATION=1` behavior unchanged.
4. Add tests for direct API calls, not only UI behavior.

Expected result:
- Self-hosted "no workspace creation" is a backend rule.
- Default workspace management is not confused with creating additional workspaces.

### Phase 4: Align Management UI

Client files:
- `src/client/WorkspaceSelector.jsx`
- `src/client/Header.jsx`
- `src/client/WorkspacePage.jsx`
- `src/client/MembersTab.jsx`
- `src/client/DeviceTokensTab.jsx`
- `src/client/actions/user.js`

Steps:
1. Allow the current workspace management entry when a workspace exists and the user has admin/editor/viewer context, including default workspace.
2. Stop using `ALLOW_WORKSPACE_CREATION` as a proxy for "can manage current workspace".
3. Keep `ALLOW_WORKSPACE_CREATION` only for create/additional-workspace affordances.
4. For auth-disabled self-hosted mode:
   - allow `/workspace` access for workspace rename and tokens;
   - refresh device tokens for self-hosted `UNKNOWN_EMAIL`, because `actions/user.js` currently skips token refresh when `message.email === UNKNOWN_EMAIL`;
   - hide invite/member role controls unless a real authenticated email exists.
5. For authenticated self-hosted mode:
   - show the same Workspace, Members, and Tokens tabs for default and user-created workspaces.

Expected result:
- Default workspace management appears in `.env.local` without enabling additional workspace creation.
- User-created self-hosted workspace UI remains unchanged.

### Phase 5: Review Default-Specific Policy Exceptions

Likely files:
- `src/client/ShareButton.jsx`
- `src/client/PlaygroundMode.jsx` or related playground/default checks
- `src/server/dekart/reportgate.go`
- server routes that read `IsDefaultWorkspace`

Steps:
1. Search all `isDefaultWorkspace`, `IsDefaultWorkspace`, and default workspace ID checks.
2. Classify each check as product policy or technical workaround.
3. Remove checks that only exist because default workspace was not manageable.
4. Keep checks that intentionally separate public playground behavior from private workspace behavior.
5. Confirm `reportgate.go` remains Cloud-safe. It bypasses company workspace gating for `IsDefaultWorkspace`, so making the flag reliable must not make Cloud workspaces accidentally bypass map limits.

Expected result:
- Default workspace is not accidentally downgraded by stale special cases.

## Test Plan

Backend:
- Add or update tests for `CanCreateWorkspace()` and `CreateWorkspace` permission behavior.
- Test `SetWorkspaceContext` for authenticated self-hosted default workspace.
- Test `SetWorkspaceContext` for auth-disabled self-hosted default workspace.
- Test `GetWorkspace` returns default workspace name, subscription, users, and counts.
- Test `UpdateWorkspace` can rename the default workspace for admins.
- Test `UpdateWorkspaceUser` works for authenticated default workspace admins and is rejected server-side for `UNKNOWN_EMAIL`.

Frontend or Cypress:
- `.env.local`: workspace management is visible without `DEKART_ALLOW_WORKSPACE_CREATION=1`.
- `.env.local`: additional workspace creation remains unavailable unless enabled.
- `.env.local`: token list refreshes in auth-disabled self-hosted mode.
- Authenticated self-hosted default workspace:
  - open workspace page;
  - rename workspace;
  - invite user;
  - change role;
  - remove user;
  - view/revoke token.
- Self-hosted with `DEKART_ALLOW_WORKSPACE_CREATION=1`:
  - user-created workspace management remains unchanged;
  - existing default workspace memberships continue to behave consistently if selected;
  - do not auto-add new users to the default workspace unless product explicitly wants default workspace membership even when additional workspace creation is enabled.

Manual matrix:
- `.env.local`
- `.env.googleoauth`
- `DEKART_DEFAULT_WORKSPACE_ADMIN`
- `DEKART_DEFAULT_WORKSPACE_ROLE=admin|editor|viewer`
- `DEKART_ALLOW_WORKSPACE_CREATION=1`
- Cloud env with `DEKART_CLOUD=1`

## Risks

- Auth-disabled mode has no real invitee identity for member management. Treat this as product policy, not just an implementation detail.
- Auth-disabled mode needs server-side member-management protection, not only hidden controls.
- Device token management currently depends on client token refresh, which skips `UNKNOWN_EMAIL`.
- `workspaces.is_default` has not been used at runtime, so older data may rely only on the fixed default ID.
- Enforcing `CreateWorkspace` server-side can break tests or local scripts that assumed UI-only gating.
- Changing default workspace context can affect device authorization, snapshot tokens, public sharing, and playground transitions because they all depend on workspace context.
- Making `IsDefaultWorkspace` reliable can affect Cloud report gating if any Cloud workspace uses the fixed default workspace ID or default flag.

## Acceptance Criteria

- Default workspace management works in local self-hosted mode without setting `DEKART_ALLOW_WORKSPACE_CREATION=1`.
- Additional workspace creation remains disabled in self-hosted mode unless explicitly enabled.
- Authenticated self-hosted default workspace admins can manage the default workspace through the same endpoints and UI controls as user-created self-hosted workspaces.
- `is_default_workspace` is reliable in user stream responses.
- Cloud behavior is unchanged.
- Tests cover backend policy, DB-backed default context, and the main workspace UI path.
