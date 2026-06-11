# RunAll Skip Empty Legacy Queries Plan

## Evidence

- Production logs on 2026-06-10 show `RunAllQueries` failing with `storage: object doesn't exist` after trying to read legacy SQL for query `7bf2abf5-7ecd-40cc-a4e3-8e4e21bf68f5`.
- The failing path is in `src/server/dekart/query.go`: `RunAllQueries` reads legacy query text from object storage when `queries.query_text == ""` and `userBucketName != ""`.
- `src/server/dekart/querysource.go` documents this as legacy behavior. New query edits store SQL inline in Postgres.
- The query source enum has explicit values for `QUERY_SOURCE_INLINE` and `QUERY_SOURCE_STORAGE`.

## Important Constraints

- Scope is only `RunAllQueries`; single-query `RunQuery` should keep current behavior.
- Do not add schema changes, migrations, env vars, or broad repair logic.
- Empty inline queries and legacy storage queries whose SQL is missing or empty should not make the whole report refresh fail.
- Valid legacy storage-backed queries should keep refreshing.
- Logs should stay high-signal and should not create alertable errors for expected missing legacy SQL.
- Because this is regression behavior in the report refresh flow, add Cypress coverage for the user-visible path.

## Implementation Plan

1. Update `RunAllQueries` in `src/server/dekart/query.go` to load legacy storage SQL only when inline query text is empty and a bucket-backed source ID exists.
2. If the legacy storage object cannot be loaded, skip that query with a warning-level log containing `queryID` and `querySourceID`.
3. After legacy loading, inject query params into the final SQL text and skip any query whose parsed SQL is still empty.
4. Preserve existing error behavior for query execution failures, cancellation handling, parameter injection, connection lookup, and public/private result storage.
5. If all report query rows are skipped because they have no runnable SQL, return a successful no-op `RunAllQueriesResponse`; keep `NotFound` when the report has no query rows at all.
6. Add a pg-s3 Cypress regression spec that creates normal report state through MCP, mutates one query into the production legacy-missing-source shape with guarded local `psql`, then verifies refresh-all succeeds for the runnable query.
7. Add the regression spec to the existing pg-s3 CI lane and ensure the Cypress image has `psql`.

## Review Notes

- This intentionally favors resilience over legacy recovery: a missing legacy SQL object is data loss for that query, but it should not block refreshing the rest of the report.
- Clean review found that skipping all storage-backed legacy queries would be too broad; the final implementation keeps valid legacy query execution and skips only missing or empty SQL.
- Cypress is required because this is a regression in report refresh behavior, not just an isolated helper failure.
- Follow-up data repair can backfill or delete affected legacy rows, but it is not required for the runtime fix.
