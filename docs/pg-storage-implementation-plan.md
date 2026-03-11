# DEKART_STORAGE=PG Implementation Plan

## Goal

Implement `DEKART_STORAGE=PG` with behavior similar to `DEKART_STORAGE=SNOWFLAKE`, while avoiding AWS/GCP dependencies.

For Postgres, the practical equivalent is **query replay storage**:
- Execute query once and persist job metadata.
- Re-run SQL on each dataset fetch to stream CSV to the client.
- Do not require cloud object storage.

## Current Baseline

- `DEKART_DATASOURCE=PG` already exists via `src/server/pgjob/pgjob.go`.
- `DEKART_STORAGE` currently supports `S3`, `GCS`, `SNOWFLAKE`, `USER` (no `PG` case).
- Dataset serving currently resolves storage by:
  - public storage copy,
  - `result_uri`,
  - `dw_job_id`,
  - or `{source}.{extension}` object key.
- Share flow currently states Postgres sharing is not supported.

## Proposed Storage Semantics for PG

When `DEKART_STORAGE=PG`:
- Do not write query result CSV to object storage.
- Store only metadata in `query_jobs` (`job_result_id`, `query_text`, timestamps).
- Read path resolves by result/job id and re-runs the query.
- Return stream as CSV (header + rows) in the same format expected by frontend.

This mirrors Snowflake's "store reference, fetch later" pattern, but with replayed SQL instead of warehouse-native `FetchResultByID`.

## Implementation Steps

### 1) Add PG storage backend wiring

- File: `src/server/main.go`
- Add a new case in `configureBucket()`:
  - `case "PG": bucket = storage.NewPGStorage()`
- Keep existing backends unchanged.

### 2) Implement storage backend

- New file: `src/server/storage/pgstorage.go`
- Implement:
  - `type PGStorage struct`
  - `type PGStorageObject struct`
- `PGStorage` should satisfy `storage.Storage`:
  - `GetObject(ctx, bucketName, object string) StorageObject`
  - `CanSaveQuery(ctx, bucketName string) bool` returns `false`
- `PGStorageObject` should satisfy `storage.StorageObject`:
  - `GetReader(ctx)`:
    - Resolve query text by `job_result_id` (fallback to `dw_job_id` mapping if needed).
    - Execute SQL using PG datasource connection.
    - Stream CSV rows using `io.Pipe` + `csv.Writer`.
  - `GetCreatedAt(ctx)`:
    - Return `query_jobs.created_at` (or `updated_at` fallback).
  - `GetSize(ctx)`:
    - Return `nil, nil` for first iteration (align with non-object semantics), or compute if needed.
  - `CopyTo(ctx, writer)`:
    - Stream from `GetReader()` into writer.
  - `GetWriter/CopyFromS3/Delete`:
    - Return explicit unsupported behavior for now.

### 3) Update pg job behavior for replay mode

- File: `src/server/pgjob/pgjob.go`
- Detect if storage object is `PGStorageObject`.
- In replay mode:
  - Do not write CSV into storage.
  - Mark job `ResultReady = true`.
  - Set `DWJobID` (or equivalent lookup id) so existing retrieval branch can find the source.
  - Preserve status transitions (`RUNNING`, `DONE`) and metadata updates.

### 4) Dataset serving and expiration rules

- File: `src/server/dekart/dataset.go`
- Ensure read path can resolve PG replay object via existing `dw_job_id` branch.
- Adjust expiration behavior:
  - For `DEKART_STORAGE=PG`, treat old jobs as replayable (not hard-expired because data is refetchable).
  - Keep strict expiration for truly ephemeral temp-storage backends.

### 5) Shareability and publish behavior

- Files:
  - `src/server/conn/connctx.go`
  - `src/server/dekart/report.go`
  - `src/server/dekart/publishreport.go`
  - `src/client/ShareButton.jsx`
- Make PG shareability depend on replay capability (not cloud bucket).
- Decide publish behavior:
  - **Phase 1**: allow internal/workspace sharing only, keep public publish disabled.
  - **Phase 2**: support public reads by replay (no public bucket copy).
- Update frontend warning text accordingly.

### 6) Environment variable cleanup

- Files:
  - `.env.example`
  - `src/server/pgjob/pgjob.go`
- Standardize datasource connection env naming:
  - currently code uses `DEKART_POSTGRES_DATASOURCE_CONNECTION`
  - `.env.example` mentions `DEKART_POSTGRES_DATA_CONNECTION`
- Support both temporarily, document preferred canonical name, and deprecate one.

### 7) Testing

- Unit tests:
  - `PGStorageObject.GetReader` CSV behavior (header, nulls, value conversion).
  - query lookup by `job_result_id`.
  - non-expiring replay behavior under `DEKART_STORAGE=PG`.
- Integration test:
  - Run query with `DEKART_DATASOURCE=PG`, `DEKART_STORAGE=PG`.
  - Fetch dataset source twice.
  - Verify second fetch re-runs query and succeeds without object storage.
- Share tests:
  - report sharable for PG replay mode.
  - publish behavior consistent with selected phase.

## Non-AWS/GCP Alternatives

If replay-every-time is too expensive:

1. **Postgres internal cache table**
   - Store compressed CSV chunks in Postgres (`bytea` or chunked rows).
   - Pros: no external dependency, faster subsequent reads.
   - Cons: larger DB footprint and cleanup policy complexity.

2. **S3-compatible self-hosted object storage**
   - Use MinIO/Ceph with existing `S3` code path via custom endpoint.
   - Pros: minimal code changes.
   - Cons: additional service to operate.

3. **Materialized results per query hash**
   - Persist query result snapshots as tables/views keyed by query hash + params hash.
   - Pros: fast reads for repeated queries.
   - Cons: schema lifecycle and permission management complexity.

## Recommended Rollout

### Phase 1 (MVP)
- Implement `DEKART_STORAGE=PG` replay mode for private/workspace usage.
- Keep public publish behavior conservative.

### Phase 2
- Add full publish support for PG replay mode.
- Remove "Postgres sharing is not supported yet" warning when valid.

### Phase 3 (optional optimization)
- Add PG local result cache table if replay latency/cost becomes problematic.

## Risks and Mitigations

- **Risk:** repeated expensive queries on every fetch.
  - **Mitigation:** add TTL + optional local cache in Phase 3.
- **Risk:** behavior divergence from existing expiration logic.
  - **Mitigation:** isolate replay-specific expiration path.
- **Risk:** SQL replay edge cases (permissions/schema drift).
  - **Mitigation:** clear error surfaces in `query_jobs.job_error` and UI retries.

## Acceptance Criteria

- `DEKART_STORAGE=PG` starts successfully and serves query results without cloud bucket.
- Query execution and dataset source retrieval work end-to-end for PG datasource.
- Existing backends (`S3`, `GCS`, `SNOWFLAKE`, `USER`) remain unaffected.
- Shareability behavior is explicit and documented for PG replay mode.
- Docs and env examples reflect supported configuration.

