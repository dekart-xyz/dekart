# Keycloak (OIDC) via reverse proxy

Dekart can authenticate users from a JWT injected by a trusted reverse proxy.
The proxy handles OIDC login/session. Dekart only verifies JWT signature and claims.

## Required server configuration

```bash
DEKART_REQUIRE_OIDC=1
DEKART_OIDC_JWKS_URL=https://<keycloak>/realms/<realm>/protocol/openid-connect/certs
DEKART_OIDC_ISSUER=https://<keycloak>/realms/<realm>
```

## Optional server configuration

```bash
DEKART_OIDC_AUDIENCE=<client-id-or-expected-aud>
```

## Security model

- Expose Dekart only behind a trusted proxy.
- Proxy must enforce auth on Dekart routes.
- Proxy must overwrite/strip inbound auth headers before forwarding upstream:
  - `X-Forwarded-Access-Token`
- Dekart rejects requests if token verification fails or expected identity claim is missing.

## Token contract

Dekart accepts either:

- `<jwt>`
- `Bearer <jwt>`

Dekart verifies:

- signature using keys from `DEKART_OIDC_JWKS_URL`
- expiry (`exp`)
- issuer (`iss`) when `DEKART_OIDC_ISSUER` is set
- audience (`aud`) when `DEKART_OIDC_AUDIENCE` is set

User identity comes from the `email` claim.

## Where to find Keycloak values

- **JWKS URL**: Realm > OpenID Endpoint Configuration > `jwks_uri`
- **Issuer**: Realm > OpenID Endpoint Configuration > `issuer`
- **Audience**: usually the client id expected in your token's `aud`
