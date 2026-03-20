# OIDC (Keycloak) support via reverse-proxy “token header” (Plan)

## Why this exists

Some self-hosted users (e.g. Keycloak environments) want:

- SSO handled by their IdP (Keycloak / Okta / Entra / Auth0 / …)
- No Google/AWS/IAP-specific auth
- A setup that works on *their own servers* (not AWS-only)
- “No weird stuff”: use standard OIDC JWTs and standard reverse-proxy patterns

Today Dekart supports specific auth modes (Google / AWS / dev). For Keycloak, the most practical path is:

> Reverse proxy authenticates the user via OIDC → forwards a signed JWT in a header → Dekart verifies the JWT using JWKS → maps claims → treats user as authenticated.

This avoids building a full OIDC login flow inside Dekart (redirects, sessions, refresh tokens, etc.) while still being secure (signature verification + issuer/audience checks).

---

## Goal

Add a **new optional auth mode** for self-hosted deployments:

- Authenticate requests using a **JWT provided in a request header**
- Verify JWT signature using **OIDC JWKS** (public keys endpoint)
- Validate:
  - issuer (`iss`)
  - audience (`aud`)
  - expiry (`exp`)
- Extract user email from a configurable claim (default: `email`)

This should unblock Keycloak by letting teams put **Keycloak (or any OIDC IdP) in front of Dekart** using a standard reverse-proxy.

---

## Non-goals (keep it simple)

- Don’t implement OIDC login redirects inside Dekart.
- Don’t implement role/group mapping (unless needed later).
- Don’t require a specific proxy (nginx / traefik / envoy / oauth2-proxy should all work).

---

## Proposed architecture

```
Browser
  ↓
Reverse proxy (does OIDC auth with Keycloak)
  - holds session cookie
  - injects a JWT header to upstream (Dekart)
  ↓
Dekart
  - reads JWT from header
  - verifies JWT using JWKS
  - reads email claim → establishes user identity
```

Notes:

- The browser cannot “just send a JWT header” by itself on navigation; the proxy is what makes this ergonomic.
- JWT can be either **id_token** or **access_token** (depends on proxy). Dekart should not care as long as it’s a JWT verifiable via JWKS and contains the configured email claim.

---

## Env vars (server)

### Toggle

- `DEKART_REQUIRE_OIDC=true`

### Token source

- `DEKART_OIDC_TOKEN_HEADER` (default: `X-Forwarded-Access-Token`)
  - Accept either:
    - raw JWT (`<jwt>`)
    - bearer format (`Bearer <jwt>`)

Optional:

- `DEKART_OIDC_ALLOW_AUTHORIZATION_HEADER=true` (default: `true`)
  - If enabled, also accept `Authorization: Bearer <jwt>`

### Verification

- `DEKART_OIDC_JWKS_URL` (required)
  - Example (Keycloak): `https://<keycloak>/realms/<realm>/protocol/openid-connect/certs`
- `DEKART_OIDC_ISSUER` (recommended)
  - Example (Keycloak): `https://<keycloak>/realms/<realm>`
- `DEKART_OIDC_AUDIENCE` (optional but recommended)
  - Match the audience your proxy/client uses for the token
- `DEKART_OIDC_EMAIL_CLAIM` (default: `email`)
  - Common alternatives: `preferred_username` (sometimes contains email), `upn`

### Operational

- `DEKART_OIDC_JWKS_CACHE_TTL_SECONDS` (default: `3600`)
  - Cache JWKS to avoid fetching on every request

---

## Reverse proxy expectations (minimal contract)

The proxy must:

1. Enforce auth for Dekart routes.
2. Provide a JWT to Dekart via one header.

Examples (not prescriptive):

- nginx + `oauth2-proxy` (OIDC to Keycloak) with `--pass-access-token` and/or `--set-authorization-header`
- traefik forward-auth middleware
- envoy ext_authz

Dekart should only require that “a header contains a JWT”.

---

## Implementation steps (server)

1. **Config plumbing**
   - Add a new config block for OIDC header auth (env vars above).

2. **JWT extraction**
   - Read from `DEKART_OIDC_TOKEN_HEADER` first.
   - Optionally fallback to `Authorization` if allowed.
   - Normalize “Bearer …”.

3. **JWKS fetch + cache**
   - Fetch keys from `DEKART_OIDC_JWKS_URL`.
   - Cache for `DEKART_OIDC_JWKS_CACHE_TTL_SECONDS`.
   - Handle key rotation (cache refresh after TTL).

4. **JWT verification**
   - Verify signature against JWKS.
   - Validate `exp` (and reject expired tokens).
   - If configured, validate `iss`.
   - If configured, validate `aud`.

5. **Claim mapping**
   - Extract email from `DEKART_OIDC_EMAIL_CLAIM` (default `email`).
   - If missing, reject request with an auth error that includes which claim was expected (no token contents).

6. **Tests**
   - Unit test for:
     - token parsing (raw vs Bearer)
     - issuer/audience validation
     - email claim mapping
     - JWKS caching behavior (basic)

7. **Docs**
   - One page: “Keycloak + reverse proxy”
   - Include:
     - where to find JWKS URL and issuer
     - recommended claim config (email)
     - example env var block

---

## Acceptance criteria

- When enabled, unauthenticated requests fail fast.
- With a valid JWT header, Dekart treats the request as authenticated and uses the email claim as the user identity.
- Works with Keycloak using a standard proxy in front of Dekart.
- No changes required to existing auth modes.

---

## PoC-only fallback (if needed)

If the customer needs something *immediately* and doesn’t care about strict verification:

- “Trusted header email” mode: proxy injects `X-User-Email`, Dekart trusts it.

This is fast but risky and should only be allowed behind strict internal networking + documented as PoC-only.

