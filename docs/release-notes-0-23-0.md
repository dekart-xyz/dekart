# v0.23

These notes cover changes since `v0.22.1`.

## 🔍 Feature Highlights

### Create maps with Claude and Codex

You can now create and edit maps directly from Claude and Codex through MCP.
Pair the [GeoSQL skill](https://github.com/dekart-xyz/geosql) with the [Dekart CLI](https://github.com/dekart-xyz/dekart-cli) to connect an agent, authorize it in the browser, run queries, update maps, and capture report snapshots.

### Start Dekart with one Docker command

Dekart now starts with zero configuration:

```sh
docker run -p 8080:8080 dekartxyz/dekart:0.23
```

The default image ships with a built-in SQLite metadata database, local file storage, and file upload, so you can create your first map right away.

**Persisting your data.** The command above keeps everything inside the container. To make your maps and uploads survive a restart, choose one of these options:

- **Local volume** — mount a host directory at `/dekart/data` to persist the SQLite metadata database and uploaded files:

  ```sh
  docker run -p 8080:8080 \
    -v $(pwd)/dekart-data:/dekart/data \
    dekartxyz/dekart:0.23
  ```

- **Amazon S3** — back up SQLite to an S3 bucket:

  ```sh
  docker run -p 8080:8080 \
    -e DEKART_STORAGE=S3 \
    -e DEKART_CLOUD_STORAGE_BUCKET=your-bucket \
    -e AWS_REGION=us-east-1 \
    -e AWS_ACCESS_KEY_ID=your-key \
    -e AWS_SECRET_ACCESS_KEY=your-secret \
    dekartxyz/dekart:0.23
  ```

- **Google Cloud Storage** — back up SQLite to a GCS bucket:

  ```sh
  docker run -p 8080:8080 \
    -e DEKART_STORAGE=GCS \
    -e DEKART_CLOUD_STORAGE_BUCKET=your-bucket \
    -v ${GOOGLE_APPLICATION_CREDENTIALS}:${GOOGLE_APPLICATION_CREDENTIALS} \
    -e GOOGLE_APPLICATION_CREDENTIALS=${GOOGLE_APPLICATION_CREDENTIALS} \
    dekartxyz/dekart:0.23
  ```

The Postgres metadata backend is still supported for deployments that prefer it (a valid `DEKART_LICENSE_KEY` is required — see below).

### Postgres is no longer required

Dekart now uses its built-in SQLite database for metadata by default, and SQLite backups can be stored in Amazon S3 or Google Cloud Storage. Self-hosted deployments no longer need a separate Postgres database.

## ⚠️ Behavior Changes

### Postgres metadata now requires a license key

Deployments that use Postgres for Dekart metadata must set a valid `DEKART_LICENSE_KEY`. [Get a key for free here](https://mailchi.mp/dekart/upgrade-to-sso).
Postgres can still be used as a user-created data connection in Community Edition, as long as metadata stays in SQLite.

### Docker now defaults to local storage

The Docker image now defaults to SQLite metadata, local file storage, and file upload.
If you adopt these defaults, persist `/dekart/data` so metadata and uploaded files survive container replacement.

### File upload is on by default, and auto-disabled with Postgres replay storage

File upload is now enabled by default (`DEKART_ALLOW_FILE_UPLOAD=1` in the Docker image), so you can upload CSV and GeoJSON files without extra configuration.

Postgres replay storage does not support file upload, so when `DEKART_STORAGE=PG` Dekart now disables file upload automatically and logs a warning at startup. You no longer need to set `DEKART_ALLOW_FILE_UPLOAD=0` yourself.

### Mapbox token is now optional

Maps render on a free MapLibre/Carto base map style by default, so you can create a map without a Mapbox token.
Set `DEKART_MAPBOX_TOKEN` only if you want Mapbox base map styles and static map thumbnail previews.

## ⚙️ Changes Important for Admins

### Self-hosted workspace management

Admins can now manage the default self-hosted workspace through the same workspace UI used for every other workspace.
This covers workspace details, members, roles, and device tokens, without enabling additional workspace creation.

### SQLite backup improvements

When `DEKART_STORAGE` is `S3` or `GCS`, SQLite backups can use the configured object storage bucket.
When `DEKART_STORAGE=PG` is used for Postgres query replay with SQLite metadata, `DEKART_CLOUD_STORAGE_BUCKET` can now configure an S3 backup and restore target using the standard AWS SDK credential chain.
Snowflake stage backup and restore remain supported.

### New snapshot and device authorization configuration

This release adds report snapshot endpoints for agent workflows and device authorization keys for CLI access.
If you use these features, you can configure snapshot rendering, snapshot token lifetime, device authorization keys, and device token lifetime.

## 🔧 User-Facing Bug Fixes

- Improved BigQuery job location handling and dataset retrieval reliability.
- Fixed active dataset loading edge cases and false unsaved-change warnings.
- Improved dataset download error messages when network requests fail.
- Fixed trip layer behavior by updating Kepler.gl dependencies.
- Improved connection testing so unchanged credentials no longer need to be re-entered, including for BigQuery service account connections.
- Improved OAuth code exchange reliability and Safari markdown rendering.
- Clarified disabled query parameter actions and corrected BigQuery connection copy.

## 🚀 Upgrade Instructions

1. **Backup your metadata database.**

2. **Update environment configuration:**

   - If Dekart uses Postgres metadata through `DEKART_POSTGRES_URL` or `DEKART_POSTGRES_*`, set a valid `DEKART_LICENSE_KEY` before startup. [Get a key for free here](https://mailchi.mp/dekart/upgrade-to-sso).
   - If you use `DEKART_STORAGE=PG`, no action is needed for file upload: it is enabled by default but auto-disabled under Postgres replay storage, which does not support it.
   - If you adopt the new zero-config Docker defaults, mount persistent storage at `/dekart/data` for the SQLite metadata database and uploaded files.
   - If your deployment previously relied on unset metadata, storage, datasource, or file upload variables, review the new Docker defaults.
   - Configure snapshot rendering and device authorization variables only if you use those features.

3. **Upgrade your image:**

   ```
   ghcr.io/dekart-xyz/dekart-premium/dekart:0.23
   ```

   OSS/Docker Hub deployments can use:

   ```
   dekartxyz/dekart:0.23
   ```

Migrations are applied automatically at startup.
