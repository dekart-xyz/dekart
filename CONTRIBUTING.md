# Contributing guidelines

## Release process

1. Create a new branch for the release, e.g. `release-1.2`
2. Create a new release candidate using the command `make preminor` (or `make prepatch` or `make premajor` depending on the type of release)
3. Then push code and tags using the command `make release`
4. Test release candidate
5. If everything is ok, create a new release using the command `make minor` (or `make patch` or `make major` depending on the type of release)
6. Then push code and tags using the command `make release`
7. Update documentation
8. Create PR for the main branch
9. Create a new release on GitHub

## Getting dev Google Auth refresh token for Cypress

1. Go to https://developers.google.com/oauthplayground/
2. Click on the gear icon (⚙️) in the top right corner and check 'Use your own OAuth credentials'.
4. Make to allowed URI is set to `https://developers.google.com/oauthplayground` for the OAuth 2.0 Client IDs
3. For `DEV_REFRESH_TOKEN`, use following scopes `https://www.googleapis.com/auth/bigquery,https://www.googleapis.com/auth/userinfo.profile,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/devstorage.read_write`
3. Click Authorize APIs
4. Use the refresh token as `DEV_REFRESH_TOKEN` for Cypress tests that need Google OAuth token scopes.

For `DEV_REFRESH_TOKEN_INFO`, repeat the flow with only these scopes: `https://www.googleapis.com/auth/userinfo.profile,https://www.googleapis.com/auth/userinfo.email`. Do not reuse the all-scope token for `DEV_REFRESH_TOKEN_INFO`; cloud info-token tests rely on the token missing sensitive BigQuery and storage scopes.

## Dev claim identity

Set `DEKART_DEV_CLAIMS=1` in the backend env file to allow local dev identity claims from `X-Dekart-Claim-Email`. Cypress should set the matching browser cookie with `cy.setDevClaimsEmail('you@example.com')` before `cy.visit()`.

## Running Cypress locally

Cypress talks to the Vite frontend at `http://localhost:3000`, and the frontend talks to the backend on `http://localhost:8080`. Run the database, backend, frontend, and Cypress in separate terminals.

1. Start local Postgres and keep this terminal open:

```bash
make up-and-down
```

2. Start the backend with the env file that matches the spec folder:

```bash
make server .env.cloud
```

Use `.env.googleoauth` for `cypress/e2e/google-oauth`, `.env.snowflake-s3` for `cypress/e2e/snowflake-s3`, and so on. If you run `.env.googleoauth` against local Vite, enable CORS for the frontend process-locally:

```bash
set -a
. ./.env
. ./.env.googleoauth
set +a
DEKART_CORS_ORIGIN=http://localhost:3000 go run ./src/server/main.go
```

3. Start the frontend:

```bash
make client
```

4. Export the Cypress env in a new terminal. Source `.env` first and the lane env second so the lane-specific values win:

```bash
set -a
. ./.env
. ./.env.cloud
set +a
```

5. Run Cypress. On local machines where `ELECTRON_RUN_AS_NODE` is already set, clear it for Cypress:

```bash
ELECTRON_RUN_AS_NODE= npx cypress run --spec "cypress/e2e/cloud/*.cy.js"
```

For the interactive UI:

```bash
ELECTRON_RUN_AS_NODE= npx cypress open
```

Only tests that call `cy.stubGoogleOAuthToken(...)` need Google OAuth refresh-token env vars. Cloud tests use `DEV_REFRESH_TOKEN_INFO` and/or `DEV_REFRESH_TOKEN`; Google OAuth tests use `DEV_REFRESH_TOKEN`. `DEV_REFRESH_TOKEN_INFO` must be an info-only token, while `DEV_REFRESH_TOKEN` must include BigQuery and storage scopes. Tests that only use `cy.setDevClaimsEmail(...)` need `DEKART_DEV_CLAIMS=1` in the backend env but do not need refresh tokens.

## Device auth JWT keypair

Device auth uses its own JWT keypair and must not reuse license signing keys.

1. Generate private/public keypair in `keys/`:

```bash
openssl genrsa -out keys/device-auth-private.pem 2048
openssl rsa -in keys/device-auth-private.pem -pubout -out keys/device-auth-public.pem
chmod 600 keys/device-auth-private.pem
chmod 644 keys/device-auth-public.pem
```

2. Base64-encode both PEM files into one-line strings:

```bash
DEVICE_AUTH_PRIVATE_KEY_B64=$(base64 < keys/device-auth-private.pem | tr -d '\n')
DEVICE_AUTH_PUBLIC_KEY_B64=$(base64 < keys/device-auth-public.pem | tr -d '\n')
```

3. Configure env vars (for example in `.env.cloud`):

```bash
DEKART_DEVICE_AUTH_PRIVATE_KEY=$DEVICE_AUTH_PRIVATE_KEY_B64
DEKART_DEVICE_AUTH_PUBLIC_KEY=$DEVICE_AUTH_PUBLIC_KEY_B64
DEKART_DEVICE_AUTH_TOKEN_TTL_HOURS=720
```

## Running prev version via docker-compose

```
docker compose  --env-file .env.bigquery --profile dekart-oss-bigquery up
docker compose  --profile dekart-oss-bigquery down
```

## Generating GIFs from videos for screencasts

To convert video files to optimized GIFs for documentation:

```bash
ffmpeg -i input.mp4 -an \
  -filter_complex "[0:v]setpts=0.5*PTS,fps=15,scale=iw/2:ih/2:flags=lanczos,format=rgb24,split[s0][s1];\
                   [s0]palettegen=max_colors=256[p];\
                   [s1][p]paletteuse=dither=sierra2_4a" \
  -loop 0 output.gif
```
