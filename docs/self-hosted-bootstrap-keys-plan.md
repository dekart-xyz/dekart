## File-Level Plan

### 1) Migration: bootstrap key storage

Create migration in [`migrations`](/Users/vladi/dev/dekart/migrations) to add table `instance_keys`.

Data structure:
- `id`
- `key_name` (`bootstrap_root`)
- `private_key_pem` (plain PEM text)
- `public_key_pem`
- `is_active` bool
- `created_at`
- `rotated_at` nullable

Constraints/indexes:
- unique active key per `key_name` (single active `bootstrap_root`).

### 2) Bootstrap key manager

Add [`src/server/jwtkeys/bootstrap.go`](/Users/vladi/dev/dekart/src/server/jwtkeys/bootstrap.go).

Functions:
- `EnsureActiveBootstrapKey(ctx, db) (privPEM []byte, pubPEM []byte, created bool, err error)`
- `GetActiveBootstrapKey(ctx, db) (privPEM []byte, pubPEM []byte, err error)`

Behavior:
- Return active key if present.
- If missing, generate RSA keypair and persist atomically.
- Handle concurrent first-use safely via transaction + unique constraint retry.

### 3) Device token issuer fallback

Update [`src/server/deviceauth/token.go`](/Users/vladi/dev/dekart/src/server/deviceauth/token.go).

Resolution order:
1. Use explicit env keypair if both vars are set.
2. Else use DB `bootstrap_root` keypair.

No claim-shape changes in `Issue(...)`.

### 4) Device token validator fallback

Update [`src/server/user/devicejwt.go`](/Users/vladi/dev/dekart/src/server/user/devicejwt.go).

`readDeviceAuthPublicKey` resolution order:
1. Env public key.
2. DB `bootstrap_root` public key.
3. Return error if unavailable.

### 5) Secrets encryption fallback

Update [`src/server/secrets`](/Users/vladi/dev/dekart/src/server/secrets).

Resolution order for encrypt/decrypt:
1. Existing configured encryption key path.
2. DB `bootstrap_root` fallback.

Compatibility requirements:
- Existing configured-key ciphertext remains readable.
- New writes use configured key when present, else bootstrap fallback.

### 6) Startup wiring

Update [`src/server/app/app.go`](/Users/vladi/dev/dekart/src/server/app/app.go).

- Warm `EnsureActiveBootstrapKey` during startup so key creation is deterministic.
- Continue normal startup even without explicit feature key env vars.

### 7) Tests

Add/update tests:
- [`src/server/jwtkeys/bootstrap_test.go`](/Users/vladi/dev/dekart/src/server/jwtkeys/bootstrap_test.go)
  - creates key when missing
  - returns existing key
  - concurrent ensure yields single active key
- [`src/server/deviceauth/token_test.go`](/Users/vladi/dev/dekart/src/server/deviceauth/token_test.go)
  - env keypair path unchanged
  - fallback to bootstrap when env keys absent
- [`src/server/user/devicejwt_test.go`](/Users/vladi/dev/dekart/src/server/user/devicejwt_test.go)
  - validates token signed by bootstrap key
  - env public key path unchanged
- tests under [`src/server/secrets`](/Users/vladi/dev/dekart/src/server/secrets)
  - encrypt/decrypt works without external key config via bootstrap fallback
  - configured-key path remains intact
