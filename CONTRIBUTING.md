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

For manual browser testing, set the same cookie from the browser console, then reload:

```js
document.cookie = 'dekart-dev-claim-email=you@example.com; path=/'
location.reload()
```

## Running Cypress locally

Cypress uses the clone-local frontend and backend ports from `.env`. Run the database, backend, frontend, and Cypress in separate terminals.

To run multiple clones at once, copy `.env.example` to `.env` in each clone and give every clone a unique `COMPOSE_PROJECT_NAME` and unique values for all eight host-local ports at the top of the file. For example, a second clone can use ports `3010`, `8090`, `5442`, `5443`, `8091`, `8092`, `4190`, and `3011`. Remote credentials and remote resource names may remain shared.

1. Start local Postgres and keep this terminal open:

```bash
make up-and-down
```

2. Start the backend with the env file that matches the spec folder:

```bash
make server .env.cloud
```

Use `.env.googleoauth` for `cypress/e2e/google-oauth`, `.env.snowflake-s3` for `cypress/e2e/snowflake-s3`, and so on. `make server` keeps the selected lane settings while applying the clone-local server, database, and CORS ports from `.env`.

3. Start the frontend:

```bash
make client
```

4. Run Cypress through Make. It loads `.env` and the lane env, then reapplies only the clone-local resource settings from `.env`:

```bash
make cypress-run ENV_FILE=.env.cloud SPEC="cypress/e2e/cloud/*.cy.js"
```

For the interactive UI:

```bash
make cypress-open ENV_FILE=.env.cloud
```

Only tests that call `cy.stubGoogleOAuthToken(...)` need Google OAuth refresh-token env vars. Cloud tests use `DEV_REFRESH_TOKEN_INFO` and/or `DEV_REFRESH_TOKEN`; Google OAuth tests use `DEV_REFRESH_TOKEN`. `DEV_REFRESH_TOKEN_INFO` must be an info-only token, while `DEV_REFRESH_TOKEN` must include BigQuery and storage scopes. Tests that only use `cy.setDevClaimsEmail(...)` need `DEKART_DEV_CLAIMS=1` in the backend env but do not need refresh tokens.

### Running the map performance benchmark

`cypress/e2e/cloud/mapPerformance.cy.js` is an opt-in, machine-local benchmark for both Point (Scatterplot) and Arc layers. It is not part of the default Cypress or CI suites because GPU and compositor performance depends on the host machine.

Prepare one saved report per layer type:

1. Start Postgres, the `.env.cloud` backend, and the frontend as described above. The backend must have `DEKART_DEV_CLAIMS=1`.
2. Open Dekart using the same email that will be passed as `performanceEmail`.
3. Upload a representative dataset no larger than 60 MB.
4. Create and save exactly one visible layer: a Point (Scatterplot) layer or an Arc layer.
5. Record the report ID from the URL, the visible dataset name, and its exact row count without thousands separators (for example, `1000000`, not `1,000,000`).

Run the Point benchmark in headed Chrome:

```bash
make cypress-run ENV_FILE=.env.cloud \
  SPEC=cypress/e2e/cloud/mapPerformance.cy.js \
  CYPRESS_ENV='runPerformance=true,performanceReportId=POINT_REPORT_ID,performanceDatasetName=DATASET NAME,performanceRows=ROW_COUNT,performanceLayerType=point,performanceLabel=Point,performanceEmail=EMAIL' \
  CYPRESS_ARGS='--browser chrome --headed --config video=false'
```

Run the Arc benchmark with the Arc report:

```bash
make cypress-run ENV_FILE=.env.cloud \
  SPEC=cypress/e2e/cloud/mapPerformance.cy.js \
  CYPRESS_ENV='runPerformance=true,performanceReportId=ARC_REPORT_ID,performanceDatasetName=DATASET NAME,performanceRows=ROW_COUNT,performanceLayerType=arc,performanceLabel=Arc,performanceEmail=EMAIL' \
  CYPRESS_ARGS='--browser chrome --headed --config video=false'
```

The terminal prints a label followed by measured FPS, p95 and worst frame time,
median blocked time per sample, and the longest main-thread task. The benchmark
takes three native zoom samples and requires at least 20 FPS, at most a 100 ms
p95 frame, at most a 200 ms worst frame, and at most a 150 ms longest task.
Compare results only on the same machine with other heavy applications idle.

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
