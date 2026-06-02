# Postgres Metadata License Plan

## Goal

Require a valid `DEKART_LICENSE_KEY` when Dekart uses Postgres as its metadata backend.

Community/no-key deployments must continue to work with SQLite metadata, and users must still be able to use Postgres/PostGIS as a datasource connector.

## Product Rule

- Postgres metadata backend: requires a valid Dekart license key.
- SQLite metadata backend: allowed without a license key.
- Postgres/PostGIS connector: allowed without a license key when Dekart metadata is SQLite.
- SSO/auth license behavior stays unchanged: SSO still requires a valid license key.

## Current Backend Signal

Dekart currently selects SQLite metadata when `DEKART_SQLITE_DB_PATH` exists in the environment.

If `DEKART_SQLITE_DB_PATH` is absent, Dekart uses Postgres metadata through `DEKART_POSTGRES_URL` or `DEKART_POSTGRES_*`.

Keep this exact predicate consistent across:

- `configureDb`
- `applyMigrations`
- startup license validation

Do not infer metadata backend from `DEKART_DATASOURCE`, `DEKART_STORAGE`, or connector settings.

## Implementation Plan

### 1. Add Shared Metadata Backend Helper

In `src/server/main.go`, add a small helper used by database setup, migrations, and license validation.

Suggested shape:

```go
func usesSQLiteMetadata() bool {
	_, ok := os.LookupEnv("DEKART_SQLITE_DB_PATH")
	return ok
}
```

Use this helper instead of duplicating `os.LookupEnv("DEKART_SQLITE_DB_PATH")`.

This preserves current behavior, including the edge case where the variable is present but empty.

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
sqliteMetadata := usesSQLiteMetadata()
app.RequireValidStartupLicense(app.StartupLicenseConfig{
	RequireForPostgresMetadata: !sqliteMetadata,
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

## Test Plan

### Unit Tests

Add `src/server/app/licensecheck_test.go`.

Cover:

- SQLite metadata, no key: allowed.
- Postgres metadata, no key: blocked.
- SQLite metadata, invalid key: blocked.
- Postgres metadata, valid key: allowed.
- SSO enabled, no key: blocked.
- SQLite metadata plus Postgres datasource-related env/config: allowed without key.

Use a fake `TokenValidator` in tests so the app tests do not depend on filesystem keys.

Keep existing `src/server/license/license_test.go` as the cryptographic token validation coverage.

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
- Local Postgres connector lanes should run without `DEKART_LICENSE_KEY` and keep SQLite metadata, proving Postgres connectors still work in Community mode.
- Lanes intentionally testing Postgres metadata should start the server with `DEKART_SQLITE_DB_PATH` absent and pass `DEKART_LICENSE_KEY`.

Because `os.LookupEnv("DEKART_SQLITE_DB_PATH")` treats an empty-but-present variable as SQLite metadata, do not use `-e DEKART_SQLITE_DB_PATH=` to select Postgres metadata.

Example for intentional Postgres metadata lanes:

```sh
env -u DEKART_SQLITE_DB_PATH /dekart/server
```

When the e2e stage defaults to SQLite metadata, use a small entrypoint/script wrapper for Postgres metadata lanes that unsets `DEKART_SQLITE_DB_PATH` before launching the server, while still passing `DEKART_LICENSE_KEY`.

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
