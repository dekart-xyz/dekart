# HTTP request URLs built from DuckDB datasets

Status: finalized after eng review 2026-10-07 (D1 sharing tradeoff accepted; D2 no test bootstrap; D3 compiler encodes arguments; D4 proto fields). Decision history, findings, the original plan and the gstack report: `duckdb-http-source-dataset-urls-design-eng-review.md`. Extends the HTTP-source design in `../../magic/docs/designs/duckdb-http-sources.md` (connections, credentials, fetch policy, static URL readers, serving route); only what changes is written here.

## 1. Goal

A DuckDB query builds one HTTPS GET URL from values in the report's datasets, reads the response with `read_json`, `read_csv`, `read_parquet` or `ST_Read`, and joins it with any other dataset of the report. Example: pick one Vaylens station, request its TravelTime driving catchment from the station's coordinates, show the polygon with the station's name and power. Several stations are several queries. No request per input row.

### Observable behavior

- SQL: the reader's first argument may be a scalar subquery whose single projection is `format(<constant URL template>, <expression>, …)`:

  ```sql
  SELECT * FROM read_json((
    SELECT format('https://api.traveltimeapp.com/v4/time-map?type=driving&travel_time=900&lat={}&lng={}&arrival_time=2026-10-09T08%3A00%3A00Z', latitude, longitude)
    FROM datasets."Stations" WHERE station_id = '5fbd3628-5e39-4927-889e-8eaa2304ad53'
  ));
  ```

  The template is a constant URL that passes every static-URL rule (matches one HTTP source, https, no userinfo, no header-name query parameter). Each `{}` stands for one complete query-parameter value; scheme, host, port, path, query keys and the other values are fixed. The number of `{}` equals the number of arguments. The compiler encodes each argument as `url_encode(CAST(<expression> AS VARCHAR))`; the author writes plain expressions.
- The subquery is compiled in its own scope: it reads report datasets, may declare its own CTEs, may use `{{parameters}}` in its predicates and expressions (not inside the template), and may not call an HTTP or file reader or another external table function. An outer CTE name is an unknown dataset (existing error); an outer alias or column fails in the browser binder before any request. It must return exactly one row with a non-NULL, non-empty URL; zero rows, several rows, a NULL argument (DuckDB's `format` returns NULL) or a binding error fails the query before any request. A query with a computed URL has exactly one HTTP reader; queries with only constant URLs keep today's behavior, including several readers.
- Execution: the server compiles the subquery and the final SQL together, resolving dataset names in both and collecting the union of their dependencies. The job records the compiled URL SQL and the template; nothing is fetched at job creation. The browser binds the pinned dependencies and the parameter values, runs the URL SQL, downloads the source with the resolved URL, registers the bytes under the recorded file name and runs the final SQL, all under the existing execution lock. Superseded or cancelled executions publish nothing. Explicit Execute, Refresh Now and auto-refresh create a fresh source id; reconciliation reuses a source id exactly as for constant URLs. A changed dependency revision or parameter value re-runs the URL SQL and downloads again.
- Serving: a computed source is downloaded through the existing route with a `url` query parameter carrying the resolved URL. After the existing report, dataset, extension and connection checks the server decrypts the header map (it needs the header names), parses the recorded template against the current connection, and accepts the submitted URL only when scheme, host, port and path are equal, the query-key sets are equal with each key once and every fixed value equal after decoding; then it fetches with the existing policy and streams through with the existing cache headers. A `url` parameter on a constant-URL source, a missing one on a computed source, or a duplicate `url` parameter is rejected before any fetch. The submitted URL is never logged with its query values.
- Sharing (accepted tradeoff, D1): anyone who can open the report, including snapshot renderers and anonymous readers of public reports, can download with any `{}` values; they cannot change host, path, keys or fixed values. Browser cache entries differ per resolved URL.
- MCP: `create_query` and `update_query` save and validate this syntax. `run_query` with `accept_duckdb_execution`, and any program preparation, fails with `Dataset-derived HTTP URLs currently require browser execution.` when a computed source is anywhere in the dependency chain, checked on the first captured dependency graph before any warehouse leaf query is launched. Programs with only constant URLs are unchanged. Running these queries through the CLI is a later design that first adds a client capability check.
- Errors use the existing Query Error line: unsupported syntax (non-constant template, placeholder and argument count differ, placeholder outside a query value, nested reader, several computed readers or a computed and a constant reader together) and `HTTP source URL query returned <n> rows; exactly one non-empty URL is required.` for cardinality and NULL results.

### Out of scope

Computed scheme, host, path or query keys; partial values and escaped braces; per-row requests; several isochrones in one query; POST bodies; pagination; MCP or CLI execution of computed sources; server-side DuckDB; server-side storage of responses.

## 2. Acceptance tests

| Test | Cases | Backend |
|---|---|---|
| `src/server/httpsource` tests: `ParseTemplate` accepts `{}` as a complete query value and resolves the source; rejects `{}` in scheme, host, path, key or part of a value, duplicate keys, header-name key, unknown host; `Match` accepts a URL differing only in `{}` values; rejects changed scheme, host, port, path, key set, fixed value, duplicate key, fragment, userinfo | 12 | Go |
| `src/server/duckdbsql/compiler_test.go`: subquery yields `URLSQL` with datasets rewritten and arguments wrapped, `URLTemplate`, deterministic file name, dependencies from both statements, parameter in the subquery predicate bound; rejects non-constant template, count mismatch, nested reader, two computed readers, computed plus constant reader; an outer CTE name yields the existing unknown-dataset error; `TestCompileHTTPReaders` unchanged | 9 | Go |
| `cypress/e2e/cloud/httpSourceDatasetUrl.cy.js` over the public fixtures base: a station dataset from literal rows; a computed `sample.csv?station={}` query loads 8276 rows and the intercepted download `url` decodes to exactly the station value, which contains `&`, `=` and a space; final SQL joins the response with the station dataset; zero rows, two rows and a NULL coordinate show the error with no download; an unqualified outer column shows a binding error with no download; editing the station dataset and re-running the dependent query changes the `url`; a `{{parameter}}` in the subquery predicate selects the station and a parameter change changes the `url`; renaming the station dataset keeps the source id | 8 | Cypress cloud lane |
| `cypress/e2e/cloud/httpSourceDatasetUrlAuth.cy.js`: direct GET with changed path, host, key, fixed value or duplicate `url` is 404; `url` on a constant source is 404; a viewer of the shared report and an anonymous reader of the public report download with another `{}` value; another report's source id is 404 | 5 | Cypress cloud lane |
| `cypress/e2e/local/mcpHttpSourceDatasetUrl.cy.js` (device flow): `update_query` saves the syntax; `run_query` with `accept_duckdb_execution` returns the browser-execution error for the computed query and for a query depending on it, and no leaf job is created; a constant-URL program still returns sources | 3 | Cypress local lane |
| Regression: `httpSource.cy.js`, `httpSourceCredentials.cy.js`, `TestCompileRejectsUnsafeSQL`, `cypress/e2e/bq/duckdbRefresh*.cy.js` | existing | Go, Cypress |

## 3. Public interfaces

### Proto (`proto/dekart.proto`) — approved

Purpose: carry the URL SQL and template of a computed source to the browser and the download route.

```proto
message HTTPSourceRevision {
  string file_name = 1; string connection_id = 2; string url = 3; string source_id = 4; string extension = 5;
  string url_sql = 6;       // compiled SELECT returning one URL column; empty for a constant URL
  string url_template = 7;  // constant URL with {} for the values the browser supplies; empty for a constant URL
}
```

Caller: the browser runs `url_sql` after binding dependencies and parameters, then downloads `/api/v1/dataset-source/{dataset}/{source_id}.{extension}?url=<resolved URL>` and registers the bytes under `file_name`. A revision has either `url` or both new fields; the file name hash covers connection, template and URL SQL. The application owns job records; `DuckDBExecutionSource` is unchanged.

### Package `src/server/httpsource` — approved

Purpose: parse a URL template whose query values may be `{}` and check a resolved URL against it, knowing nothing about jobs or datasets.

```go
type Template struct { SourceID, URL string; Placeholders int }   // URL normalized, {} kept
func ParseTemplate(template string, sources []Source) (Template, error)  // static-URL rules plus placeholder rules
func (t Template) Match(rawURL string) (string, error)                   // normalized URL to fetch, or why it differs
```

Caller: the compiler calls `ParseTemplate` to validate the template and count placeholders; the download handler calls `ParseTemplate` with the current connection (header names come from the decrypted map, as today), then `Match` with the submitted URL, before `Fetch`. Errors reuse `*NoSourceError` and `*HeaderParamError`; mismatches return a plain error the handler maps to 404.

### Compiler (`src/server/duckdbsql`) — approved

```go
type HTTPSourceRef struct { FileName, SourceID, URL, Extension, URLSQL, URLTemplate string }
```

`Compile` signature unchanged. For a subquery argument it validates the template and the subquery, rewrites datasets and parameters in the subquery, wraps the arguments, serializes it into `URLSQL`, replaces the argument with the file name and merges the subquery's dependencies into `Result.Dependencies`. Constant URLs compile as before.

### Download route and MCP

Internal changes only: `serveHTTPSource` gains the `url` parameter handling above; `prepareDuckDBExecution` rejects a chain containing a computed source on the first captured graph, before launching warehouse leaves.

### Client

No new library. `actions/duckdb.js` runs the URL SQL and downloads with the resolved URL inside the existing lock; `lib/duckdb/runtime.js` exposes parameter binding before the final statement.

## 4. Invariants

- DuckDB `format` and `url_encode` return NULL for a NULL argument (duckdb CLI v1.5.2, probe 2026-10-07), so no extra null flag is needed.
- The server fetches upstream on every download and stores nothing; the browser cache key is the full download URL including `url` (`src/server/dekart/httpsource.go`).
- The compiler has dataset labels but no column schemas (`compiler.go`, `datasetsByLabel`), so an unqualified outer column is caught by the browser binder, not the compiler.
- Job creation writes records inside the report transaction and never fetches (`duckdbcommand.go`).

## 5. Slices

1. Server: `ParseTemplate` and `Match`, compiler subquery support, proto fields, job records, download route with `url`, MCP rejection. Done when the Go tests and the MCP local spec are green. No probe.
2. Browser: URL SQL evaluation, download with the resolved URL, cardinality and binding errors, refresh behavior. Done when both cloud Cypress specs are green. No probe.
3. Map: station dataset plus one TravelTime catchment query per selected station, joined with station name and power, shared as a viewer map. Done when a viewer opens the map and sees the polygon and station fields. Depends on the existing TravelTime HTTP source.

## 6. Open questions

- The Cypress public upstream ignores query strings, so the end-to-end spec proves the value flow, not a value-dependent response; the TravelTime map in slice 3 is the first value-dependent proof.
- Whether a fixed `arrival_time` in the template is acceptable for the first map, or the author derives it in the subquery.

Implement the public interfaces as written. An extra export or argument needs a plan update before it ships; stop and propose it instead of adding it.
