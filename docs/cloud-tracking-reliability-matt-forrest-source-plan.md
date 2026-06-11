# Cloud Tracking Reliability and Matt Forrest Source Plan

## Context

Dekart Cloud source attribution and other funnel events are losing tracking records. These events matter for growth analysis, activation funnels, and the Matt Forrest partner promotion. The current client tracking path sends Plausible and Dekart internal tracking from the same async `track(...)` flow, while important funnel events can race with navigation or workflow transitions.

This change hardens internal tracking for Cloud client mode only. Non-Cloud/self-hosted deployments should continue not writing internal tracking events.

## Current State

Verified on 2026-06-10.

| Area | Current behavior | Evidence |
|------|------------------|----------|
| Client tracking entrypoint | `track(...)` wraps Plausible plus internal server dispatch in `setTimeout(..., 0)` | `src/client/lib/tracking.js:19-55` |
| Internal tracking dispatch | Dispatches `grpcCall(Dekart.TrackEvent, request)` and does not expose completion to caller | `src/client/actions/tracking.js:5-18` |
| Cloud-only client gate | Client skips server tracking unless `env.isCloud` is true | `src/client/actions/tracking.js:7-10` |
| Cloud-only server gate | Server returns without insert unless `DEKART_CLOUD` is set | `src/server/dekart/track.go:17-22` |
| Tracking DB write | Server writes to `track_events` and logs DB errors, but returns success to client | `src/server/dekart/track.go:50-66` |
| Workspace source event | Source form emits event name `CreateWorkspaceFormSource${values.source}` before `createWorkspace` | `src/client/WorkspacePage.jsx:137-145` |
| Allowed workspace sources | Current options omit Matt Forrest | `src/client/WorkspacePage.jsx:161-169` |

Magic analytics context:

- `docs/outreach-attribution-mar-may-2026.md` reports `7 of 43` workspaces did not record a form source event.
- `memory/2026-04-27.md` records `18` active non-paid workspaces with no source event.
- Matt Forrest partner context exists in Magic `MEMORY.md`: source fields measure marketing impact but do not replace coupon or 3-way-intro commission attribution.

## Proposed Change

1. Keep one public client `track(event, props)` API for existing call sites.
2. Decouple Plausible tracking from Dekart internal tracking so Plausible failure or downtime never prevents internal tracking.
3. Make Dekart internal tracking awaitable in Cloud mode, then await the critical workspace source attribution path:
   - only send internal events when `env.isCloud === true`;
   - make internal tracking awaitable so critical funnel call sites can wait for RPC completion before continuing;
   - do not surface tracking failures to users;
   - ensure server-side DB write failures are logged.
4. Keep non-Cloud/internal tracking disabled:
   - client dispatch remains gated on `env.isCloud === true`, which is derived from `DEKART_CLOUD === '1'`;
   - server dispatch remains guarded by the existing non-empty `DEKART_CLOUD` check unless implementation finds a separate bug that justifies changing server Cloud-mode semantics;
   - SQLite/self-hosted/non-Cloud deployments do not write internal tracking events.
5. Add workspace source option:
   - value: `MattForrest`;
   - label: `Matt Forrest`;
   - event emitted by existing pattern: `CreateWorkspaceFormSourceMattForrest`.

## Important Constraints

Do not add schema migrations. Do not remove existing SQLite migrations. The Cloud gate is behavioral, not migration-based.

- Keep `track(...)` as the only public client tracking API.
- Plausible must stay independent and best-effort.
- Cloud internal tracking must stay gated on `env.isCloud === true`.
- Tracking failures must not dispatch user-facing `setError` or `setStreamError`.
- Workspace creation must not be blocked beyond one named timeout, initially `1000ms`.
- Keep server `TrackEvent` DB failure behavior unchanged: log insert failures and return success.

This does not guarantee delivery if the user hard-closes the tab before the awaited call finishes, the browser kills the page, or the network fails. It is intentionally simpler than a durable client outbox and avoids duplicate/exactly-once complexity across multiple windows.

## Implementation Plan

1. Update `src/client/actions/tracking.js` so Cloud internal tracking can be awaited.
2. Update `src/client/lib/tracking.js` so Plausible tracking stays independent and best-effort.
3. Update `src/client/WorkspacePage.jsx` to disable submit immediately and await source tracking before workspace creation.
4. Add the `MattForrest` source option in `src/client/WorkspacePage.jsx`.
5. Keep `src/server/dekart/track.go` behavior unchanged except for fixes required by the client flow.
6. Add one Cypress test for Cloud workspace source submission.

## Testing Plan

Add one Cypress test in the `.env.cloud` configuration verifying workspace source submission is saved.

## Rollback Plan

Revert the app code change and redeploy. No database rollback is required because this issue must not introduce schema changes.

## Effort Estimate

- Tracking path refactor: 2-4h
- Matt Forrest source option: 15-30m
- Manual verification: 1-2h
- Total: 0.5-1 day


## Out of Scope

- Changes in `../dekart-etl`
- Plausible dashboard or goal configuration
- Affiliate commission automation
- Coupon-code implementation
- SSO key request source attribution
- New tracking tables or schema migrations
- Removing existing SQLite migrations
- User-visible tracking error UI
