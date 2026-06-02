# Postgres Metadata License Plan

## Goal

Require a valid `DEKART_LICENSE_KEY` when Dekart uses Postgres as its metadata backend.
Users can get a license key from the [Dekart license key form](https://mailchi.mp/dekart/upgrade-to-sso).

Community/no-key deployments must continue to work with SQLite metadata, and users must still be able to use Postgres/PostGIS as a datasource connector.

## Product Rule

- Postgres metadata backend: requires a valid Dekart license key from the [Dekart license key form](https://mailchi.mp/dekart/upgrade-to-sso).
- SQLite metadata backend: allowed without a license key.
- Postgres/PostGIS connector: allowed without a license key when Dekart metadata is SQLite.
- SSO/auth license behavior stays unchanged: SSO still requires a valid license key.

## Current Backend Signal

Dekart currently selects SQLite metadata when `DEKART_SQLITE_DB_PATH` exists in the environment.

If `DEKART_SQLITE_DB_PATH` is absent, Dekart uses Postgres metadata through `DEKART_POSTGRES_URL` or `DEKART_POSTGRES_*`.

This signal should change.

New metadata backend selection:

- If `DEKART_POSTGRES_URL` is present, use Postgres metadata.
- If any metadata connection field from `DEKART_POSTGRES_*` is present, use Postgres metadata.
- Postgres metadata env wins over `DEKART_SQLITE_DB_PATH` when both are present.
- If no Postgres metadata env is present, use SQLite metadata through `DEKART_SQLITE_DB_PATH`.
- SQLite remains the community/no-key metadata backend.

Use an allowlist for metadata Postgres env names. Do not treat connector/cache env names such as `DEKART_POSTGRES_DATASOURCE_CONNECTION` as metadata backend selection.

Keep this exact predicate consistent across:

- `configureDb`
- `applyMigrations`
- startup license validation
- SQLite backup/restore decisions

Do not infer metadata backend from `DEKART_DATASOURCE`, `DEKART_STORAGE`, or connector settings.

## Implementation Plan

### 1. Add Shared Metadata Backend Helper

In `src/server/main.go`, add a small shared backend selector used by database setup, migrations, and license validation.

Suggested shape:

```go
type metadataBackend string

const (
	metadataBackendPostgres metadataBackend = "postgres"
	metadataBackendSQLite   metadataBackend = "sqlite"
)

func selectedMetadataBackend() metadataBackend {
	if hasPostgresMetadataEnv() {
		return metadataBackendPostgres
	}
	return metadataBackendSQLite
}

func hasPostgresMetadataEnv() bool {
	for _, key := range []string{
		"DEKART_POSTGRES_URL",
		"DEKART_POSTGRES_USER",
		"DEKART_POSTGRES_PASSWORD",
		"DEKART_POSTGRES_HOST",
		"DEKART_POSTGRES_PORT",
		"DEKART_POSTGRES_DB",
	} {
		if _, ok := os.LookupEnv(key); ok {
			return true
		}
	}
	return false
}
```

Use this helper instead of duplicating env checks.

This intentionally changes precedence: Postgres metadata env wins over `DEKART_SQLITE_DB_PATH`.

`DEKART_SQLITE_DB_PATH` is still used as the SQLite database path when SQLite metadata is selected. If SQLite metadata is selected and the path is absent, use the existing default behavior or fail clearly according to the current code path.

Update `src/server/dekart/server.go` so SQLite backup behavior follows the same selector. Backups should not run merely because `DEKART_SQLITE_DB_PATH` is non-empty when Postgres metadata env is also present.

### 2. Refactor Startup License Validation

Refactor `src/server/app/licensecheck.go` so logic is testable without `log.Fatal`.

Suggested shape:

```go
type StartupLicenseConfig struct {
	RequireForPostgresMetadata bool
}

type TokenValidator func(string) (license.TokenInfo, error)

func ValidateStartupLicense(config StartupLicenseConfig, validate TokenValidator) error
func RequireValidStartupLicense(config StartupLicenseConfig)
```

Rules:

- If `DEKART_LICENSE_KEY` is non-empty, validate it.
- If license key is invalid, return/fatal even if SQLite metadata is used.
- If SSO env vars are enabled and key is empty, block startup.
- If `RequireForPostgresMetadata` is true and key is empty, block startup.
- Otherwise allow startup.

Keep the existing AGPL/license comment and CTA in fatal/error messages.

### 3. Wire License Validation Before DB Setup

In `src/server/main.go`, call the startup license guard before `configureDb()`.

Suggested flow:

```go
metadataBackend := selectedMetadataBackend()
app.RequireValidStartupLicense(app.StartupLicenseConfig{
	RequireForPostgresMetadata: metadataBackend == metadataBackendPostgres,
})

db := configureDb()
```

This fails before Postgres connection/migration attempts when a license is missing.

### 4. Do Not Gate Postgres Connectors

Do not add license checks to:

- `src/server/pgjob/pgjob.go`
- user-defined connection save/test paths
- MCP Postgres connector paths
- `DEKART_DATASOURCE=PG`
- `DEKART_STORAGE=PG`
- `DEKART_POSTGRES_DATASOURCE_CONNECTION`

Those are datasource/cache paths, not metadata backend selection.
Keep connector-only env names out of `hasPostgresMetadataEnv()`.

## Test Plan

### Unit Tests

Add `src/server/app/licensecheck_test.go`.

Cover:

- SQLite metadata, no key: allowed.
- Postgres metadata, no key: blocked.
- Postgres metadata env plus `DEKART_SQLITE_DB_PATH`, no key: blocked.
- Postgres metadata env plus `DEKART_SQLITE_DB_PATH`, valid key: uses Postgres metadata.
- SQLite metadata, invalid key: blocked.
- Postgres metadata, valid key: allowed.
- SSO enabled, no key: blocked.
- SQLite metadata plus Postgres datasource-related env/config, such as `DEKART_POSTGRES_DATASOURCE_CONNECTION` or `DEKART_DATASOURCE=PG`: allowed without key.

Use a fake `TokenValidator` in tests so the app tests do not depend on filesystem keys.

Keep existing `src/server/license/license_test.go` as the cryptographic token validation coverage.

Add focused tests for the metadata selector in `src/server/main_test.go` or another main-package test file:

- no Postgres metadata env selects SQLite
- `DEKART_POSTGRES_URL` selects Postgres
- one structured `DEKART_POSTGRES_*` metadata field selects Postgres
- Postgres metadata env wins when `DEKART_SQLITE_DB_PATH` is also present
- datasource-only Postgres env names do not select Postgres metadata

### CI / E2E Tests

Make the e2e Docker image closer to production defaults.

In the `e2etest` stage of `Dockerfile`, set the same community defaults as the production image:

```dockerfile
ENV DEKART_SQLITE_DB_PATH=/dekart/data/dekart.db
ENV DEKART_STORAGE=USER
ENV DEKART_DATASOURCE=USER
ENV DEKART_ALLOW_FILE_UPLOAD=1
ENV DEKART_LOCAL_FILES_ROOT=/dekart/data/files
```

Create the local files directory in the e2e image if needed.

Then update `.github/workflows/e2e.yaml`:

- Lanes intended to prove no-key OSS/community behavior should rely on SQLite metadata.
- Local Postgres connector lanes should run without `DEKART_LICENSE_KEY` and keep SQLite metadata, proving Postgres connectors still work in Community mode. These lanes must avoid metadata `DEKART_POSTGRES_*` env names unless they intentionally test licensed Postgres metadata.
- Lanes intentionally testing Postgres metadata should pass metadata `DEKART_POSTGRES_*` or `DEKART_POSTGRES_URL` env and pass `DEKART_LICENSE_KEY`.

With the new selector, do not rely on unsetting `DEKART_SQLITE_DB_PATH` to choose Postgres metadata. Postgres metadata is selected by the presence of `DEKART_POSTGRES_URL` or metadata `DEKART_POSTGRES_*` connection fields.

Example for intentional Postgres metadata lanes:

```sh
-e DEKART_POSTGRES_HOST=postgres \
-e DEKART_POSTGRES_PORT=5432 \
-e DEKART_POSTGRES_DB=dekart \
-e DEKART_POSTGRES_USER=dekart \
-e DEKART_POSTGRES_PASSWORD=dekart \
-e DEKART_LICENSE_KEY=$DEKART_LICENSE_KEY_SEC \
```

After this plan change, unsetting `DEKART_SQLITE_DB_PATH` is not required for backend selection.

Example for no-key Postgres connector lanes:

```sh
-e DEKART_STORAGE=USER \
-e DEKART_DATASOURCE=USER \
```

With e2e defaults updated, those connector lanes use SQLite metadata by default.

## Docs / Install Updates

Update install docs and env examples that currently imply Postgres metadata works without a license key.

Likely files:

- `install/docker-compose/README.md`
- `install/docker-compose/docker-compose.bigquery.yaml`
- `install/docker-compose/docker-compose.snowflake-s3.yaml`
- `install/docker-compose/docker-compose.googleoauth.yaml`
- `install/docker-compose/docker-compose.oidc.yaml`
- `install/docker-compose/docker-compose.yaml`
- `install/docker/README.md`
- `install/docker/Makefile`
- `install/app-engine/app.example.yaml`
- `install/ecs/ecs.tf`
- `.env.example`
- `.env.oss-bigquery`
- `.env.bigquery`
- `.env.pg`
- `.env.pg-s3`

Docs should state:

- zero-config/community Docker uses SQLite metadata
- Postgres metadata requires `DEKART_LICENSE_KEY`
- Postgres/PostGIS datasource connectors remain available with SQLite metadata

## Acceptance Criteria

- Server startup fails clearly when Postgres metadata is selected without `DEKART_LICENSE_KEY`.
- Server startup succeeds with SQLite metadata and no license key.
- Existing SSO license requirement still works.
- Postgres/PostGIS connectors work in a no-key SQLite metadata deployment.
- CI has explicit coverage for both:
  - licensed Postgres metadata
  - no-key SQLite metadata with Postgres connector usage
