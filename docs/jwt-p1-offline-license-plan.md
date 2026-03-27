# JWT P1: Offline Premium License Plan

## Goal

Implement an offline JWT-based license check for the Premium/self-hosted distribution so Dekart can support:

- fixed-duration trials
- perpetual paid licenses
- capability-based gating
- clear admin UX
- no online activation dependency

This document is intentionally P1-scoped:

- no machine fingerprinting
- no remote license server
- no revocation list
- no cryptographic anti-tamper ambitions beyond honest-user licensing

The real gate remains:

- private Premium image distribution
- commercial relationship
- support / updates / trust

## Product model

### Community / OSS

- auth-free
- public maps / evaluation / demos
- no premium-only team features

### Premium Trial

- private Premium image
- `DEKART_LICENSE_KEY` set
- same runtime as paid Premium, but trial expires

### Premium Paid

- private Premium image
- `DEKART_LICENSE_KEY` set
- perpetual or update-bounded entitlement

## Why JWT

JWT is good enough here because:

- issuance is easy
- validation is fully local
- trial expiry is built-in via `exp`
- key rotation is easy via `kid`
- support/debugging is straightforward

Use:

- `Ed25519` signing
- `EdDSA` JWT alg
- embedded public verification key(s) in Premium code

## Token format

### Header

```json
{
  "alg": "EdDSA",
  "typ": "JWT",
  "kid": "2026-03"
}
```

### Claims

Required:

- `iss`: `dekart.xyz`
- `aud`: `dekart-premium`
- `sub`: stable license id
- `jti`: unique token id
- `typ`: `trial` or `paid`
- `edition`: `premium`
- `iat`
- `nbf`
- `email`
- `company`
- `features`: array of capability ids

Trial-only:

- `exp`

Optional paid-only future field:

- `updates_until`

Example:

```json
{
  "iss": "dekart.xyz",
  "aud": "dekart-premium",
  "sub": "lic_01HQXYZ...",
  "jti": "jwt_01HQXYZ...",
  "typ": "trial",
  "edition": "premium",
  "iat": 1774060800,
  "nbf": 1774060800,
  "exp": 1775270400,
  "email": "admin@example.com",
  "company": "Example Inc",
  "features": [
    "auth",
    "history",
    "autorefresh",
    "previews",
    "analytics",
    "support"
  ]
}
```

## Capability model

Use explicit feature ids instead of inferring everything from plan type.

Suggested capability ids:

- `auth`
- `history`
- `autorefresh`
- `previews`
- `analytics`
- `support`

P1 rule:

- backend derives capabilities from the JWT
- frontend consumes normalized capability flags from the stream / env response
- server enforces sensitive/stateful operations

## Runtime states

Normalize runtime into 3 states:

- `community`
- `premium_trial`
- `premium_licensed`

These should be computed server-side and sent to the frontend as normalized state, not re-derived independently on the client.

## Backend design

### New package

Add:

- `src/server/license/license.go`

Responsibilities:

- parse `DEKART_LICENSE_KEY`
- verify JWT signature
- validate `iss`, `aud`, `nbf`, `exp`
- expose normalized license object:
  - `State`
  - `Type`
  - `Email`
  - `Company`
  - `Features`
  - `ExpiresAt`
  - `UpdatesUntil`
  - `Valid`
  - `Reason` on invalid/expired

Suggested types:

```go
package license

type State string

const (
    StateCommunity       State = "community"
    StatePremiumTrial    State = "premium_trial"
    StatePremiumLicensed State = "premium_licensed"
)

type Info struct {
    State        State
    Type         string
    Edition      string
    Email        string
    Company      string
    LicenseID    string
    TokenID      string
    Features     map[string]bool
    ExpiresAt    *time.Time
    UpdatesUntil *time.Time
    Valid        bool
    Reason       string
}
```

### Public keys

Add:

- `src/server/license/keys.go`

This file should hold embedded public keys keyed by `kid`.

P1 is fine with:

```go
var publicKeys = map[string]string{
    "2026-03": "-----BEGIN PUBLIC KEY----- ...",
}
```

Later this can move to PEM files embedded via `embed`.

### Startup wiring

Current likely entry point:

- [app.go](/Users/vladi/dev/dekart/src/server/app/app.go)

P1 change:

- initialize the license verifier once at startup
- pass normalized `license.Info` provider into the main server

Suggested:

- add field on `dekart.Server`:
  - `LicenseInfoFunc func() license.Info`

or:

- add a small `LicenseProvider` interface

### Workspace / user stream integration

Current user state is largely driven by:

- [subscription.go](/Users/vladi/dev/dekart/src/server/user/subscription.go)
- [stream.go](/Users/vladi/dev/dekart/src/server/dekart/stream.go)
- [workspace.go](/Users/vladi/dev/dekart/src/server/user/workspace.go)

P1 rule:

- keep `PlanType` behavior compatible for existing client logic
- add explicit license fields instead of overloading everything into `PlanType`

Recommended proto additions:

In [dekart.proto](/Users/vladi/dev/dekart/proto/dekart.proto), add:

```proto
message LicenseState {
    enum State {
        STATE_UNSPECIFIED = 0;
        STATE_COMMUNITY = 1;
        STATE_PREMIUM_TRIAL = 2;
        STATE_PREMIUM_LICENSED = 3;
    }
    State state = 1;
    bool valid = 2;
    bool expired = 3;
    string reason = 4;
    string email = 5;
    string company = 6;
    string expires_at = 7;
    repeated string features = 8;
}
```

Then add to:

- `GetUserStreamResponse`
- optionally `GetWorkspaceResponse`

This is better than relying only on:

- `plan_type`
- `workspace.expired`

### Plan type compatibility

Current client logic treats:

- `TYPE_SELF_HOSTED` as self-hosted with all features
- `TYPE_TRIAL` as cloud trial

P1 for self-hosted Premium:

- community self-hosted keeps `TYPE_SELF_HOSTED`
- premium self-hosted can initially still return `TYPE_SELF_HOSTED`
- frontend should stop assuming `TYPE_SELF_HOSTED => hasAllFeatures=true`
- use explicit `license.features` or `license.state` instead

This is one of the main client cleanup tasks.

## Client design

### Current fork points

Important files:

- [userReducer.js](/Users/vladi/dev/dekart/src/client/reducers/userReducer.js)
- [SubscriptionTab.jsx](/Users/vladi/dev/dekart/src/client/SubscriptionTab.jsx)
- [WorkspacePage.jsx](/Users/vladi/dev/dekart/src/client/WorkspacePage.jsx)

Today:

- `TYPE_SELF_HOSTED` implies `hasAllFeatures = true`
- self-hosted hides subscription UI entirely

That must change.

### New client model

Client should derive:

- `isSelfHosted`
- `licenseState`
- `licenseFeatures`
- `canUseAuth`
- `canUseHistory`
- `canUseAutoRefresh`
- `canUseAnalytics`

Do not use `PlanType.TYPE_SELF_HOSTED` as shorthand for “full premium”.

### Subscription / license settings UI

For self-hosted installs:

- show a small `License` section in Settings / Plan tab
- visible to admin only

States:

- Community
  - `Community edition`
  - CTA: `Start 14-day Premium trial`
- Premium Trial
  - `Premium trial active until YYYY-MM-DD`
  - CTA: `Upgrade to Premium`
- Premium Licensed
  - `Premium license active`
  - optional support contact / release channel text
- Invalid / expired key
  - clear warning
  - show recovery action

### Gated feature UX

Use intent-triggered upgrade prompts, not generic nagging.

Examples:

- user opens report history:
  - show empty state: `Version history is available in Premium`
- user tries to enable scheduled refresh:
  - show modal: `Scheduled refresh is a Premium feature`
- user opens analytics/export:
  - show gate with trial CTA
- user enables auth config without license:
  - show actionable error, not silent failure

## Auth gating behavior

Because OSS is now auth-free:

- any auth-requiring config in Community mode should fail early and clearly

Good behavior:

- on startup, if auth env vars are enabled but license lacks `auth`
  - fail with clear message:
    - `Auth requires a valid Dekart Premium license. Add DEKART_LICENSE_KEY or disable auth settings to continue in Community mode.`

This should be a startup validation error, not a random request-time surprise.

Suggested place:

- `src/server/main.go` or early app configuration path

## Validation algorithm

On startup:

1. read `DEKART_LICENSE_KEY`
2. if empty:
   - return `community`
3. parse JWT header
4. select public key by `kid`
5. verify `Ed25519` signature
6. validate claims:
   - `iss == dekart.xyz`
   - `aud == dekart-premium`
   - `nbf <= now`
   - `exp > now` if present
7. normalize features
8. build `license.Info`

Do not panic on invalid key.

Instead:

- log warning
- expose invalid state
- degrade to community capabilities

Exception:

- if premium-only auth config is enabled, startup should fail clearly

## File-by-file implementation plan

### 1. Proto

Update:

- [dekart.proto](/Users/vladi/dev/dekart/proto/dekart.proto)

Changes:

- add `LicenseState` message
- add `license_state` to `GetUserStreamResponse`
- optionally add `license_state` to `GetWorkspaceResponse`

Then regenerate:

- Go protobuf
- JS protobuf

### 2. License package

Add:

- `src/server/license/license.go`
- `src/server/license/keys.go`
- `src/server/license/license_test.go`

Tests:

- valid trial
- expired trial
- valid paid
- wrong issuer
- wrong audience
- unknown `kid`
- bad signature

### 3. Server wiring

Update:

- [app.go](/Users/vladi/dev/dekart/src/server/app/app.go)
- [server.go](/Users/vladi/dev/dekart/src/server/dekart/server.go) if needed
- [workspace.go](/Users/vladi/dev/dekart/src/server/user/workspace.go)
- [stream.go](/Users/vladi/dev/dekart/src/server/dekart/stream.go)

Changes:

- initialize license provider
- attach normalized license state to streamed user/workspace responses

### 4. Startup validation

Update:

- `src/server/main.go`

Add:

- config validation:
  - if auth config present and `license.features["auth"]` is false
  - fatal with actionable error

### 5. Client reducer / selectors

Update:

- [userReducer.js](/Users/vladi/dev/dekart/src/client/reducers/userReducer.js)

Changes:

- stop treating `TYPE_SELF_HOSTED` as `hasAllFeatures`
- add reducers/selectors for:
  - `licenseState`
  - `licenseValid`
  - `licenseExpired`
  - `licenseFeatures`

### 6. Settings / plan UI

Update:

- [SubscriptionTab.jsx](/Users/vladi/dev/dekart/src/client/SubscriptionTab.jsx)
- [Plans.jsx](/Users/vladi/dev/dekart/src/client/Plans.jsx)

Changes:

- self-hosted no longer returns `null`
- show admin-only license status card
- add trial CTA for community self-hosted

### 7. Gated feature UIs

Likely update:

- `MapChangeHistoryModal.jsx`
- components that configure auto-refresh
- analytics UI
- preview-related admin UI

Pattern:

- if capability missing, render upgrade prompt instead of hard hidden/no-op behavior

### 8. Trial issuance tooling

P1 can be manual/CLI-driven.

Add a small script outside runtime path, for example:

- `scripts/license-issue.js`
- or `scripts/license-issue.go`

Inputs:

- email
- company
- type (`trial` or `paid`)
- duration days for trial
- features
- `kid`

Output:

- signed JWT string

This should not be part of the application runtime.

## Suggested rollout order

### Phase A: backend foundation

- add proto
- add license package
- add server-side normalization
- add tests

### Phase B: client compatibility

- stop `TYPE_SELF_HOSTED => all features`
- surface license state in UI

### Phase C: gating and UX

- settings license card
- gated history / auto-refresh / analytics prompts
- startup auth validation

### Phase D: issuance and docs

- CLI issuer
- docs for trial activation
- docs for paid activation

## Non-goals for P1

Do not do yet:

- host binding
- hardware binding
- online activation
- revocation service
- phone-home license validation
- machine seat counting

These add complexity faster than they add value at this stage.

## Acceptance criteria

- Community self-hosted works with no license key
- Premium self-hosted works with valid JWT key
- Trial expires cleanly without data loss
- Invalid key degrades gracefully to community mode
- Auth config in community mode fails with a clear actionable error
- Client no longer assumes `TYPE_SELF_HOSTED == all features`
- Admin can see current license state in UI
- Issuing a 14-day trial key is a one-command operation
