# JWT License Key Implementation Plan (Phase 2)

## Overview

Add offline JWT license key verification to Dekart. When `DEKART_LICENSE_KEY` is set, Dekart verifies it against an embedded public key and enables auth. Without it, Dekart runs in anonymous mode. SSO env vars without a license key cause a fatal error with a trial CTA.

## JWT Format

### Claims

```json
{
  "iss": "dekart.xyz",
  "sub": "vladi@company.com",
  "exp": 1712361600
}
```

- `iss`: always `"dekart.xyz"`. Verified on parse.
- `sub`: work email of the license holder. Displayed in settings UI. This is the lead.
- `exp`: Unix timestamp. Any expiry date (14 days, 30 days, 1 year). Omit for perpetual license.

No other claims in v1. No `plan`, `org`, `aud`, `features`, `kid`, `jti`, `nbf`, `typ`.

### Signing

- Algorithm: RS256 (`alg: "RS256"`)
- Note: `github.com/golang-jwt/jwt` is already in go.mod
- Private key: stored on dekart.xyz backend only, never in repo or CI
- Public key: embedded in Go binary as a const string

## Key Generation (one-time)

```bash
openssl genrsa -out license-private.pem 2048
openssl rsa -in license-private.pem -pubout -out license-public.pem
```

- `license-private.pem`: secure storage only (1Password, secrets manager). Never committed.
- `license-public.pem`: committed to repo, embedded in binary.

## File Changes

### New files

#### `src/server/user/license.go`

Core license verification logic.

```go
package user

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/rs/zerolog/log"
)

// Embedded public key (contents of license-public.pem)
const licensePublicKeyPEM = `-----BEGIN PUBLIC KEY-----
...
-----END PUBLIC KEY-----`

type LicenseState int

const (
	LicenseNone    LicenseState = iota // no key provided
	LicenseTrial                       // valid key with future exp
	LicensePaid                        // valid key with no exp (perpetual)
	LicenseExpired                     // valid key with past exp
	LicenseInvalid                     // invalid signature or parse error
)

type License struct {
	State     LicenseState
	Email     string    // from sub claim
	ExpiresAt time.Time // zero value if perpetual
	Raw       string    // original JWT string
}

func (l *License) IsActive() bool {
	return l.State == LicenseTrial || l.State == LicensePaid
}

func (l *License) DaysRemaining() int {
	if l.ExpiresAt.IsZero() {
		return -1 // perpetual
	}
	days := int(time.Until(l.ExpiresAt).Hours() / 24)
	if days < 0 {
		return 0
	}
	return days
}

var publicKey *rsa.PublicKey

func init() {
	block, _ := pem.Decode([]byte(licensePublicKeyPEM))
	if block == nil {
		log.Fatal().Msg("failed to decode embedded license public key PEM")
	}
	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to parse embedded license public key")
	}
	var ok bool
	publicKey, ok = pub.(*rsa.PublicKey)
	if !ok {
		log.Fatal().Msg("embedded license key is not RSA")
	}
}

func ValidateLicense(tokenString string) *License {
	if tokenString == "" {
		return &License{State: LicenseNone}
	}

	token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return publicKey, nil
	}, jwt.WithIssuer("dekart.xyz"))

	if err != nil {
		// Distinguish expired from invalid
		if isExpiredError(err) {
			// Re-parse without exp validation to get claims
			token, _ = jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
				return publicKey, nil
			}, jwt.WithIssuer("dekart.xyz"), jwt.WithoutClaimsValidation())
			if token != nil {
				claims := token.Claims.(jwt.MapClaims)
				return &License{
					State:     LicenseExpired,
					Email:     claimString(claims, "sub"),
					ExpiresAt: claimTime(claims, "exp"),
					Raw:       tokenString,
				}
			}
		}
		log.Error().Err(err).Msg("invalid license key")
		return &License{State: LicenseInvalid}
	}

	claims := token.Claims.(jwt.MapClaims)
	email := claimString(claims, "sub")
	expiresAt := claimTime(claims, "exp")

	state := LicensePaid // no exp = perpetual
	if !expiresAt.IsZero() {
		state = LicenseTrial
	}

	return &License{
		State:     state,
		Email:     email,
		ExpiresAt: expiresAt,
		Raw:       tokenString,
	}
}

func isExpiredError(err error) bool {
	// jwt/v5 wraps expiration as a validation error
	return err.Error() == "token has invalid claims: token is expired" ||
		jwt.ErrTokenExpired.Is(err)
}

func claimString(claims jwt.MapClaims, key string) string {
	if v, ok := claims[key].(string); ok {
		return v
	}
	return ""
}

func claimTime(claims jwt.MapClaims, key string) time.Time {
	if v, ok := claims[key].(float64); ok && v > 0 {
		return time.Unix(int64(v), 0)
	}
	return time.Time{}
}
```

#### `src/server/user/license_test.go`

```go
package user

import (
	"testing"
)

// Generate test keypair and tokens in TestMain or use pre-generated test fixtures

func TestValidateLicense_ValidTrial(t *testing.T) {
	// Sign a JWT with exp = 14 days from now
	// Validate returns LicenseTrial with correct email and expiry
}

func TestValidateLicense_ValidPerpetual(t *testing.T) {
	// Sign a JWT with no exp claim
	// Validate returns LicensePaid with zero ExpiresAt
}

func TestValidateLicense_Expired(t *testing.T) {
	// Sign a JWT with exp = yesterday
	// Validate returns LicenseExpired (not LicenseInvalid)
}

func TestValidateLicense_InvalidSignature(t *testing.T) {
	// Sign with a different private key
	// Validate returns LicenseInvalid
}

func TestValidateLicense_Empty(t *testing.T) {
	// Empty string returns LicenseNone
}

func TestValidateLicense_WrongIssuer(t *testing.T) {
	// Sign with iss != "dekart.xyz"
	// Validate returns LicenseInvalid
}

func TestDaysRemaining(t *testing.T) {
	// Perpetual returns -1
	// Future exp returns positive int
	// Past exp returns 0
}
```

#### `scripts/sign-license.js`

```javascript
#!/usr/bin/env node

const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");

const args = parseArgs(process.argv.slice(2));

if (!args.email) {
  console.error("Usage:");
  console.error("  node sign-license.js --email user@company.com --days 14");
  console.error("  node sign-license.js --email user@company.com --days 365");
  console.error("  node sign-license.js --email user@company.com  # perpetual");
  process.exit(1);
}

const privateKeyPath =
  args["key"] || path.join(__dirname, "..", "keys", "license-private.pem");
const privateKey = fs.readFileSync(privateKeyPath, "utf8");

const payload = {
  iss: "dekart.xyz",
  sub: args.email,
};

const options = {
  algorithm: "RS256",
};

if (args.days) {
  options.expiresIn = `${args.days}d`;
}

const token = jwt.sign(payload, privateKey, options);

console.log(`DEKART_LICENSE_KEY=${token}`);

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true;
      result[key] = val;
      if (val !== true) i++;
    }
  }
  return result;
}
```

### Modified files

#### `src/server/app/app.go`

Add license check to `Configure()` function, before `ClaimsCheck` creation.

```go
// Add to imports
// (user package already imported)

// Add to Configure(), before claimsCheck creation (around line 189)

// --- License key check ---
licenseKeyRaw := os.Getenv("DEKART_LICENSE_KEY")
license := user.ValidateLicense(licenseKeyRaw)

// Detect SSO env vars
ssoConfigured := os.Getenv("DEKART_REQUIRE_OIDC") == "1" ||
	os.Getenv("DEKART_REQUIRE_GOOGLE_OAUTH") == "1" ||
	os.Getenv("DEKART_REQUIRE_IAP") == "1" ||
	os.Getenv("DEKART_REQUIRE_AMAZON_OIDC") == "1"

switch license.State {
case user.LicenseInvalid:
	log.Fatal().Msg("Invalid DEKART_LICENSE_KEY. Check that the key is correct.")

case user.LicenseNone:
	if ssoConfigured {
		log.Fatal().Msg(
			"Authentication requires a Dekart license key.\n\n" +
				"Get a free trial:\n" +
				"  1. Go to dekart.xyz/trial\n" +
				"  2. Enter your work email\n" +
				"  3. Add DEKART_LICENSE_KEY=<your-key> to your environment\n" +
				"  4. Restart Dekart\n\n" +
				"To run without auth, remove DEKART_REQUIRE_OIDC and other auth env vars.",
		)
	}
	log.Info().Msg("No license key. Starting in anonymous mode.")

case user.LicenseExpired:
	if ssoConfigured {
		log.Warn().
			Str("email", license.Email).
			Time("expired_at", license.ExpiresAt).
			Msg("License expired. Auth disabled. Starting in anonymous mode. Renew at dekart.xyz/pricing")
	}

case user.LicenseTrial:
	log.Info().
		Str("email", license.Email).
		Int("days_remaining", license.DaysRemaining()).
		Msg("Premium trial active")

case user.LicensePaid:
	log.Info().
		Str("email", license.Email).
		Msg("Premium license active (perpetual)")
}

// Pass license to ClaimsCheck or store globally for access by handlers
// Option: add License field to ClaimsCheckConfig
```

**Startup behavior matrix:**

| `DEKART_LICENSE_KEY` | SSO env vars | Result |
|---|---|---|
| absent | absent | Anonymous mode. Welcome screen. |
| absent | present | **FATAL.** "Get a trial key." |
| invalid signature | any | **FATAL.** "Invalid key." |
| valid, expired | absent | Anonymous mode. Log warning. |
| valid, expired | present | Anonymous mode. Auth disabled. Log warning. |
| valid, active | absent | Licensed. Auth available but not required. |
| valid, active | present | Licensed. Auth enabled. |

#### `src/server/user/subscription.go`

Update `GetDefaultSubscription()` to consider license state.

```go
func GetDefaultSubscription(license *License) proto.PlanType {
	if os.Getenv("DEKART_CLOUD") != "" {
		return proto.PlanType_TYPE_PERSONAL
	}
	if license != nil && license.IsActive() {
		return proto.PlanType_TYPE_TRIAL // or a new TYPE_PREMIUM_SELF_HOSTED
	}
	return proto.PlanType_TYPE_SELF_HOSTED
}
```

#### `proto/dekart.proto`

Add license info to `GetUserStreamResponse`:

```protobuf
message GetUserStreamResponse {
    StreamOptions stream_options = 1;
    int64 connection_update = 2;
    string email = 3;
    string workspace_id = 4;
    PlanType plan_type = 5;
    int64 workspace_update = 6;
    UserRole role = 7;
    bool is_playground = 8;
    bool is_default_workspace = 9;
    repeated Workspace user_workspaces = 10;
    // New fields for license
    LicenseInfo license_info = 11;
}

message LicenseInfo {
    LicenseState state = 1;
    string email = 2;           // license holder email
    int64 expires_at = 3;       // unix timestamp, 0 if perpetual
    int32 days_remaining = 4;   // -1 if perpetual, 0 if expired
}

enum LicenseState {
    LICENSE_NONE = 0;
    LICENSE_TRIAL = 1;
    LICENSE_PAID = 2;
    LICENSE_EXPIRED = 3;
}
```

#### `src/client/reducers/userReducer.js`

Add license state derivation:

```javascript
// Add to the reducer that processes GetUserStreamResponse

// Existing:
// isSelfHosted: planType === TYPE_SELF_HOSTED || isDefaultWorkspace
// hasAllFeatures: [TEAM, GROW, MAX, SELF_HOSTED, TRIAL].includes(planType)

// New:
// licenseInfo: action.licenseInfo || null
// hasLicense: licenseInfo?.state === LICENSE_TRIAL || licenseInfo?.state === LICENSE_PAID
// licenseExpired: licenseInfo?.state === LICENSE_EXPIRED
// licenseDaysRemaining: licenseInfo?.daysRemaining ?? null
// licenseEmail: licenseInfo?.email ?? null
```

#### `src/client/UpgradeModal.jsx`

Replace `if (isSelfHosted) return null` with self-hosted trial CTA:

```jsx
// Current behavior (around the early return):
// if (isSelfHosted) return null

// New behavior:
if (isSelfHosted && !hasLicense) {
  // Show self-hosted upgrade CTA
  return (
    <SelfHostedUpgradeModal
      licenseExpired={licenseExpired}
      onDismiss={onDismiss}
    />
  );
}

// SelfHostedUpgradeModal content:
// - If licenseExpired:
//   "Your trial has expired. Your maps and data are safe."
//   "Renew at dekart.xyz/pricing"
// - If no license:
//   "Want team features? Auth, version history, auto-refresh."
//   "Start a free trial at dekart.xyz/trial"
```

#### New: `src/client/WelcomeScreen.jsx`

First-run welcome screen for anonymous mode:

```jsx
// Shown once per browser (localStorage: dekart_welcome_dismissed)
// Full-page overlay before main UI

// Content:
// "Welcome to Dekart"
// "You're running Dekart Community (anonymous mode)."
// "Anyone with the URL can view and edit maps."
//
// [Create your first map]  (dismisses, goes to main UI)
//
// "Want team features?"
// [Start a free 14-day trial]  (opens dekart.xyz/trial in new tab)

// Conditions to show:
// - isSelfHosted === true
// - hasLicense === false
// - localStorage.getItem("dekart_welcome_dismissed") !== "true"
```

#### New: `src/client/LicenseStatus.jsx`

License status card for workspace settings page:

```jsx
// Renders in settings/workspace page

// States:
//
// LicenseNone:
//   "Edition: Community (anonymous mode)"
//   [Get a free 14-day trial] --> dekart.xyz/trial
//
// LicenseTrial:
//   "Edition: Premium Trial"
//   "Licensed to: vladi@company.com"
//   "Expires: April 6, 2026 (12 days remaining)"
//   [Buy Premium] --> dekart.xyz/pricing
//
// LicenseExpired:
//   "Edition: Community (trial expired)"
//   "Your trial expired on March 23, 2026."
//   "Your maps and data are safe."
//   [Buy Premium] --> dekart.xyz/pricing
//
// LicensePaid:
//   "Edition: Premium"
//   "Licensed to: vladi@company.com"
```

## Detailed Startup Sequence

```
main()
  |
  v
app.Configure()
  |
  v
1. Read DEKART_LICENSE_KEY from env
  |
  v
2. user.ValidateLicense(key)
  |  - Parse JWT
  |  - Verify RS256 signature against embedded public key
  |  - Verify iss == "dekart.xyz"
  |  - Check exp claim
  |  - Return License{State, Email, ExpiresAt}
  |
  v
3. Check SSO env vars
  |  ssoConfigured = DEKART_REQUIRE_OIDC == "1" ||
  |                  DEKART_REQUIRE_GOOGLE_OAUTH == "1" ||
  |                  DEKART_REQUIRE_IAP == "1" ||
  |                  DEKART_REQUIRE_AMAZON_OIDC == "1"
  |
  v
4. Decision matrix (see table above)
  |  - Fatal on invalid key
  |  - Fatal on SSO without key
  |  - Warn on expired key
  |  - Info on active key
  |  - Info on anonymous mode
  |
  v
5. Store license in app state (accessible by handlers)
  |
  v
6. Create ClaimsCheck with auth config
  |  - If license not active AND ssoConfigured: already fatal above
  |  - If license active: ClaimsCheck uses auth env vars as before
  |  - If no license, no SSO: ClaimsCheck allows all (anonymous)
  |
  v
7. Continue normal startup (gRPC, HTTP, etc.)
  |
  v
8. GetUserStream handler includes LicenseInfo in response
```

## Testing Plan

### Unit tests (`license_test.go`)

Generate a test keypair at test time. Sign tokens with the test private key. Override the embedded public key for tests.

| Test | Input | Expected |
|---|---|---|
| valid trial 14d | JWT with exp = now + 14d | LicenseTrial, correct email, DaysRemaining ~14 |
| valid trial 365d | JWT with exp = now + 365d | LicenseTrial, DaysRemaining ~365 |
| valid perpetual | JWT with no exp | LicensePaid, ExpiresAt zero, DaysRemaining -1 |
| expired yesterday | JWT with exp = now - 1d | LicenseExpired, DaysRemaining 0 |
| expired 30d ago | JWT with exp = now - 30d | LicenseExpired |
| wrong signature | JWT signed with different key | LicenseInvalid |
| wrong issuer | JWT with iss = "other.com" | LicenseInvalid |
| empty string | "" | LicenseNone |
| garbage string | "not-a-jwt" | LicenseInvalid |
| missing sub | JWT with no sub claim | LicenseTrial/Paid with empty Email |

### Integration tests (startup)

| Test | Env vars | Expected |
|---|---|---|
| anonymous mode | no key, no SSO | Starts. Anonymous mode. |
| SSO without key | DEKART_REQUIRE_OIDC=1, no key | Fatal exit with trial CTA message |
| valid key + SSO | valid key + DEKART_REQUIRE_OIDC=1 | Starts with auth enabled |
| expired key + SSO | expired key + DEKART_REQUIRE_OIDC=1 | Starts anonymous. Warning logged. |
| invalid key | garbage key | Fatal exit. "Invalid license key." |
| valid key, no SSO | valid key, no auth vars | Starts. Licensed. Auth available. |

### Frontend tests

| Test | State | Expected UI |
|---|---|---|
| welcome screen | anonymous, first visit | Welcome screen shown |
| welcome dismissed | anonymous, localStorage flag set | Welcome screen not shown |
| settings anonymous | LicenseNone | "Community (anonymous mode)" + trial CTA |
| settings trial | LicenseTrial, 12 days left | "Premium Trial, expires ..., 12 days" |
| settings expired | LicenseExpired | "Trial expired" + buy CTA |
| settings paid | LicensePaid | "Premium, licensed to ..." |
| upgrade modal | self-hosted, no license | Self-hosted trial CTA (not null) |
| expiry banner | LicenseTrial, 3 days left | Non-blocking banner "expires in 3 days" |

## Migration Path for Existing Users

### Existing OSS users (anonymous mode today)

No change. They keep running without a key. Anonymous mode works exactly as before. They see a welcome screen once. That's it.

### Existing OSS users with OIDC configured

This is the breaking change. On next upgrade, Dekart will fatal because they have OIDC env vars but no license key.

Mitigation:
- Release notes clearly document this
- Fatal message includes exact steps to get a free trial key
- Trial key is free and instant (dekart.xyz/trial)
- Alternative: remove OIDC env vars to continue in anonymous mode

Considered but rejected: grace period env var (`DEKART_LEGACY_OIDC=1`). Adds complexity, delays conversion, and the fix is simple (get a free trial key in 60 seconds).

### Existing Premium customers (private image)

No change in Phase 2. They continue using the private Premium image as before. License key is optional for them initially. When ready, issue them perpetual paid keys and they add one env var.

## Dependencies

### Already in go.mod
- `github.com/golang-jwt/jwt` (used by OIDC verification)
- `github.com/rs/zerolog` (logging)

### New
- None for Go backend
- `jsonwebtoken` npm package for `scripts/sign-license.js` (dev dependency only)

## Files Summary

| File | Action | Description |
|---|---|---|
| `src/server/user/license.go` | **New** | JWT validation, License struct, LicenseState enum |
| `src/server/user/license_test.go` | **New** | Unit tests for license validation |
| `src/server/app/app.go` | **Modify** | Add license check + SSO guard to startup |
| `src/server/user/subscription.go` | **Modify** | GetDefaultSubscription considers license |
| `proto/dekart.proto` | **Modify** | Add LicenseInfo message + LicenseState enum |
| `src/client/reducers/userReducer.js` | **Modify** | Add license state derivation |
| `src/client/UpgradeModal.jsx` | **Modify** | Self-hosted trial CTA instead of null |
| `src/client/WelcomeScreen.jsx` | **New** | First-run welcome screen |
| `src/client/LicenseStatus.jsx` | **New** | License status card for settings |
| `scripts/sign-license.js` | **New** | License key issuance script |
| `keys/license-public.pem` | **New** | Embedded public key (committed) |
| `keys/license-private.pem` | **New** | Signing key (NOT committed, .gitignore) |
