# Recover missing stored query results through the existing rerun flow

Status: Implemented and verified on local Postgres/S3 with Cypress in Chrome.

## Problem and outcome

A report can retain a completed query result whose CSV no longer exists in
object storage. `ServeDatasetSource` returns 404, and the client displays a
download error. The client already handles 410 by displaying “result expired,
re-running” and running the query when its current state allows execution.

For a confirmed missing stored query result, return the existing 410 `expired`
response so that this recovery works without a new client flow. Missing uploaded
files and unrecognized source IDs must not trigger query execution.

The production incident confirms missing objects and failed downloads. It does
not establish why the objects disappeared. Recovery does not resolve that cause.

## Scope

- Change missing-object handling in `ServeDatasetSource` for
  `source_extension_storage`, the private stored-result branch from the incident.
- Handle absence reported by either `GetCreatedAt` or `GetReader` before any
  response bytes are written.
- Establish query ownership and completion from existing dataset and query-job
  records. Reuse existing completed statuses, including the supported legacy
  completed status. Do not infer a query result from a `.csv` suffix or from the
  dataset having a query alone.
- Apply this recovery only when `{dataset}` identifies an existing dataset row.
  Legacy URLs that use a query ID without a dataset row retain existing behavior.
- Reuse `storageError`'s 410 response and `processDownloadError`'s existing rerun
  behavior, including `canRun` and pending-execution checks.

Out of scope: finding the deletion cause, regenerating uploaded files, changing
public-storage or HTTP-source behavior, changing temporary warehouse or presigned
URL expiry, legacy query-ID recovery, new retry policies, new endpoints,
migrations, settings, or UI text. Keep the existing legacy fallback code unchanged.

## Required behavior

1. Preserve report access and connection authorization before reading storage.
2. When the selected branch is `source_extension_storage` and storage reports
   object-not-found, verify that the requested source ID is the result of a
   completed warehouse query belonging to an existing requested dataset row.
3. When that verification succeeds, respond with HTTP 410 and body `expired\n`.
   The report client uses its existing flow to run the current query with current
   parameters. Recovery does not promise to restore the historical result bytes.
4. A missing uploaded file, unknown source ID, result belonging to another
   dataset, or result of a pending/failed job must not be classified as expired
   query data. Preserve their existing response behavior; missing objects remain
   404.
5. A database lookup failure must remain an error, rather than becoming a
   positive ownership match or being hidden as expiry.
6. Storage permission, authentication, cancellation, and network errors must keep
   their current classification. Do not translate arbitrary read failures to 410.
7. The client must continue to skip automatic execution when `canRun` is false or
   the query already has an execution pending. A failed rerun must surface through
   the existing query-error flow.
8. Keep missing-object diagnostic context and existing error-level storage logs.
   The cause remains unknown; this spec does not classify the loss as expected
   bucket expiry or silence its alerts.

## Acceptance tests

Write the first regression at the Go handler layer, using existing SQL test
patterns and a storage object that returns `storage.ErrObjectNotExist`:

| Input | Expected observable outcome |
| --- | --- |
| Owned completed query result; `GetCreatedAt` reports missing | 410, `expired\n`; reader is not opened |
| Owned completed query result; attributes succeed, reader reports missing | 410, `expired\n`; no CSV bytes returned |
| Existing dataset row, owned result with legacy completed status; object missing | Same 410 recovery classification |
| Uploaded file, unknown source, foreign query result, or incomplete job; object missing | No expiry classification or automatic rerun |
| Query-result ownership lookup fails | Error response, not 410 |
| Owned completed result; permission or network failure | Existing error classification, not 410 |
| Owned completed result; object exists | Existing 200 CSV response and cache headers |

Add focused client coverage for the existing 410 behavior: a runnable query
dispatches recovery, a pending or non-runnable query does not, and a 404 file
download does not dispatch execution.

Add one Cypress regression in the `pg-s3` runtime lane using a Postgres query
whose result is written to S3, with no warehouse job ID or presigned result URI.
Assert that this fixture uses `source_extension_storage`. Execute a real
query, remove only its generated result object from test storage while retaining
the database reference, and reload the report. Assert a real 410 download, query
recovery, and visible restored map data. Use local test storage; do not delete
production objects or substitute an intercepted 410 for the server regression.
Give the spec the required first-line regression reason and register its runtime
lane under the repository's E2E rules. A local/S3-backed reproduction is sufficient
for wiring; the Go regression supplies the exact GCS missing-object error.

## Implementation plan

1. Add the failing Go regression in `src/server/dekart/dataset_test.go` for an
   owned completed query result with a missing storage object.
2. Add the exclusion and read-stage cases from the acceptance table.
3. Update missing-object classification in `src/server/dekart/dataset.go`, using
   existing database records and storage error types.
4. Verify the existing client recovery guards with focused action tests; change
   client behavior only if those tests expose a mismatch with this spec.
5. Add and run the real storage-backed Cypress recovery regression on its matching
   runtime configuration, then run affected package checks.

## Evidence and interfaces

- Cloud BigQuery check on October 14, 2026, for September 14 through the check:
  3,098 job records across 539 queries linked to current dataset rows; zero job
  records linked to a legacy query with an existing report and no dataset.
  Of 5,094 current queries, zero have a report ID and no dataset row. Another
  170 jobs across 64 queries lack a current dataset or report reference and do
  not establish use of the legacy report-loading path. These joins describe
  current records, not historical HTTP URL usage. Vladi excluded legacy query-ID
  recovery from this change. Legacy completion status is a separate concept and
  remains supported for results belonging to an existing dataset.
- `src/server/dekart/dataset.go`: `ServeDatasetSource`, `storageError`, and
  `datasetOwnsSource`. The latter recognizes both uploaded files and results, so
  its boolean alone cannot prove that a missing object is a completed query result.
- `src/server/dekart/job.go`: result lookup and existing query-job completion states.
- `src/server/dekart/error.go`: `isStorageObjectNotFound` and existing 404 mapping.
- `src/server/dekart/error_test.go`: GCS 404 mapping already has passing coverage.
- `src/server/storage/gcs.go`: attributes return missing-object errors; current
  logging reports them at error level.
- `src/client/actions/dataset.jsx`: `processDownloadError` reruns only for 410
  and a dataset with `queryId`, subject to execution-state guards.

The existing dataset-source endpoint changes its response from 404 to 410 only
for the confirmed query-result case above. No protobuf or database schema changes
are required. Rollback restores the previous classification; stored data is not
modified by the classification change itself. Automatic reruns can incur normal
warehouse query costs, just as the existing temporary-result recovery does.
