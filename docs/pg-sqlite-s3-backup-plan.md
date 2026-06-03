# Postgres Replay Storage SQLite S3 Backup Plan

## Goal

Allow deployments that use `DEKART_STORAGE=PG` for Postgres query replay and SQLite for Dekart metadata to back up and restore the SQLite database through an S3 bucket.

## Current Problem

- `validateStorageConfig()` rejects any `DEKART_CLOUD_STORAGE_BUCKET` when `DEKART_STORAGE=PG`.
- `getBackupTarget()` only selects object storage when `DEKART_STORAGE` is `S3` or `GCS`.
- As a result, a Community deployment using a Postgres connector/replay backend with SQLite metadata cannot configure remote SQLite backups.

## Product Rule

- `DEKART_STORAGE=PG` controls query result replay, not the metadata database backend.
- SQLite metadata remains eligible for backup and restore when `DEKART_CLOUD_STORAGE_BUCKET` is configured.
- For `DEKART_STORAGE=PG`, the configured bucket is explicitly an S3 backup target, using the existing AWS SDK credential chain plus optional `AWS_REGION` and `AWS_ENDPOINT` configuration.
- A PG backup bucket is backup-only. It must not advertise map preview storage because PG replay storage cannot write preview objects.
- GCS backup with `DEKART_STORAGE=PG` is not added because the current configuration has no independent object-storage provider signal.
- Postgres metadata remains ineligible for SQLite backup through the existing metadata backend selector.

## Implementation

1. Remove the startup validation that requires `DEKART_CLOUD_STORAGE_BUCKET` to be empty for `DEKART_STORAGE=PG`.
2. Let `getBackupTarget()` select object storage when a bucket is configured and `DEKART_STORAGE` is `PG`, `S3`, or `GCS`.
3. Keep `STORE_MAP_PREVIEW`, `SaveMapPreview`, and stored preview reads disabled when `DEKART_STORAGE=PG`, even when a backup bucket is configured.
4. Add focused tests proving:
   - PG storage with a bucket passes startup storage validation.
   - PG storage with a bucket selects object storage.
   - PG storage without a bucket leaves SQLite backup disabled.
   - Existing GCS and S3 selection behavior remains unchanged.
   - Postgres metadata remains excluded from SQLite backup.
   - PG storage with a backup bucket does not advertise map preview storage.
   - PG storage with a backup bucket rejects direct map preview API calls.
   - PG storage with a backup bucket serves the default preview instead of reading from the backup bucket.
   - Existing S3 and GCS storage with a bucket still advertise map preview storage.
   - The shared object-storage restore path restores the latest SQLite backup object, which covers PG after target selection.
5. Update release notes to state that PG replay storage can use an S3 bucket for SQLite metadata backups and name the required AWS configuration.

## Verification

- Run `go test ./src/server` and `go test ./src/server/dekart`.
- Review the final diff for configuration ambiguity and regressions.
