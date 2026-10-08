# Eng review record: HTTP request URLs built from DuckDB datasets

Target (fixed): `docs/duckdb-http-source-dataset-urls-design.md`. Review: `/magic-eng-review` via gstack `plan-eng-review`, 2026-10-07. Reviewer: Claude Fable 5.1. Code evidence: `../dekart` branch `httpfs` (original HTTP-source design implemented, uncommitted). Report file: this document; the plan keeps only the finalized design.

## Original plan (unchanged copy, 2026-10-07)

## HTTP request URLs built from DuckDB datasets

Status: proposed design, not implemented.

Extends the [original HTTP-source design](../../magic/docs/designs/duckdb-http-sources.md)
([absolute source](/Users/vladi/dev/magic/docs/designs/duckdb-http-sources.md)) and
[DuckDB architecture](duckdb-design.md). The original design owns connections,
credentials, fetching, source ownership and static URL readers. This document
changes its constant-URL restriction for one narrowly defined case.

### Goal

Use values from a report dataset to build one GET request, read its response in
DuckDB, and join that response with any other datasets in the same report.

Example: select one Vaylens station, build a TravelTime request from its
coordinates, and display its driving catchment with the station's name and power.
Several stations use several catchment queries in this first version. No request
is made once per input row.

### Existing behavior and evidence

- Static HTTP URLs already work with `read_json`, `read_csv`, `read_parquet`,
  their approved auto variants and `ST_Read`.
- Ordinary joins over `datasets."Name"` already work. They are not restricted to
  one dataset or one connection.
- `src/server/duckdbsql/compiler.go` currently resolves literal URLs, replaces
  them with local file names, and returns HTTP source references.
- `src/server/dekart/duckdbcommand.go` records those sources on jobs with pinned
  dataset dependencies. No upstream request runs inside the report transaction.
- `src/client/actions/duckdb.js` downloads HTTP sources and registers their bytes
  before executing a job. A URL derived from dataset rows cannot be known at
  server compilation time.
- TravelTime's GET `/v4/time-map` accepts coordinate and travel-time parameters
  with connection headers. A tested request returned JSON containing five
  catchment shapes. Its response still needs ordinary SQL geometry conversion.
  [TravelTime reference](https://docs.traveltime.com/api/reference/isochrones).

### SQL and user behavior

A supported reader may take a scalar subquery with one `format` projection:

```sql
SELECT *
FROM read_json((
  SELECT format(
    'https://api.traveltimeapp.com/v4/time-map?type=driving&travel_time=900&lat={}&lng={}&arrival_time=2026-10-09T08%3A00%3A00Z',
    url_encode(CAST(latitude AS VARCHAR)),
    url_encode(CAST(longitude AS VARCHAR))
  )
  FROM datasets."Stations"
  WHERE station_id = '5fbd3628-5e39-4927-889e-8eaa2304ad53'
));
```

This is proposed Dekart syntax. The compiler extracts the subquery and replaces
it with a local file name; it does not pass a subquery argument to a native
DuckDB reader. Native reader binding need not support this syntax.

- The URL SELECT must be self-contained and uncorrelated. It may declare its own
  CTEs, but cannot refer to an outer CTE, alias or column. The compiler rejects
  identifiable outer CTEs and qualified outer references. Because it has no
  dataset column schemas, it cannot classify every unqualified column. The
  independent URL SELECT must bind successfully in the browser before fetching;
  an unresolved outer column produces an error with no API request.
  It can filter, join and aggregate existing report datasets using the
  existing safe SQL rules. Dependencies include every dataset referenced here
  and in the final query. Existing report parameters may be used in its ordinary
  expressions and predicates, outside the quoted URL template.
- It must return exactly one non-null, non-empty string. Zero rows, multiple rows,
  a null argument, a wrong type or an empty URL fails before any API download.
  A null argument is rejected even if `format` would turn it into a string.
- The first argument to `format` is a constant URL template. Each `{}` replaces
  one complete query-parameter value. Each corresponding argument must be
  `url_encode(<safe SQL expression cast to VARCHAR>)`. Placeholder count must
  match argument count. Escaped braces, partial values and repeated parameter
  names are not supported in this version.
- Scheme, host, port, path, query-parameter names and other parameter values are
  fixed by the template. Computed origins, paths and parameter names are outside
  this version. A constant template must match an existing workspace connection.
- The source must be HTTPS and retain every original URL rule, including the
  header-name parameter prohibition. Credentials remain in connection headers.
- A query with a computed URL contains exactly one HTTP reader. It may reference
  any number of report datasets. Queries whose HTTP URLs are all literals keep
  their existing behavior, including multiple HTTP reads.
- The URL subquery cannot itself call an HTTP/file reader or another external
  table function. API results used to construct URLs must be separate datasets.
- No new connection type, editor panel or query execution engine is introduced.
  The error line explains unsupported syntax or cardinality failures.

The final SQL may flatten JSON, convert shapes into `_geojson`, or join the API
response with `datasets."Stations"`, population, POIs or other report datasets.
For several stations, create one catchment dataset per selected station and
combine those datasets with ordinary SQL. Automatic pagination and per-row
requests are outside this design.

### Execution and source records

1. The server validates and compiles both the URL subquery and the final SQL.
   It resolves dataset names to existing internal views in both statements,
   collects their combined dependencies, and binds parameter references through
   the same existing parameter slots and per-dataset parameter table.
2. Job creation records the compiled URL SQL and its approved template with the
   HTTP source descriptor. It records ordinary dependency revisions. The server
   does not evaluate browser data or fetch upstream while creating a job.
3. Each executing client first materializes the pinned dependencies and installs
   that job's parameter values under the existing execution lock.
4. The client runs the URL SQL, checks argument nulls and output cardinality, then
   requests the dataset-source route with the resolved URL. One materialization
   attempts one fetch; no implicit network retries are added.
5. The server validates the supplied URL against the job's recorded template and
   connection before decrypting headers or fetching. The response is registered
   under the recorded file name. The client then executes the final compiled SQL.
6. Final publication uses the existing job/report checks. Superseded or cancelled
   executions cannot register or publish their old response. URL selection, HTTP
   download, registration and final SQL stay inside the existing execution lock.

#### Proposed contract changes

These are additions to the original design's interfaces, subject to review before
implementation. Proto remains the source of truth; use `make proto`.

- Extend `HTTPSourceRevision` with `url_sql` and `url_template` strings, and the
  compiler's `HTTPSourceRef` with the same two properties.
- A static descriptor keeps its normalized `url`; both new fields are empty.
  A computed descriptor has empty `url` and both new fields populated. A partial
  or mixed descriptor is invalid. Its connection is resolved at compilation.
- `url_sql` is the server-compiled SELECT used by clients to evaluate the URL and
  argument nulls. Its result contract is one URL column and one boolean column
  indicating whether any template argument was null. The compiler adds the
  second column; users still write one projection.
- `url_template` records the fixed URL structure against which the server checks
  downloads. It contains no credentials. It is not a URL that the server fetches.
- File names retain `dekart_internal/http_<16 hex>.<ext>[.gz]`. Their hash includes
  connection ID, template and normalized compiled URL SQL for computed sources.
  Reader options and gzip naming keep the original behavior.
- Reuse `GET /api/v1/dataset-source/{dataset}/{source}.{ext}`. For computed sources
  only, add a `url` query parameter containing the encoded resolved URL. Static
  sources reject a supplied override; computed sources require it. Duplicate
  `url` parameters are rejected.
- Store descriptors in the existing `query_jobs.http_sources` JSON. No additional
  source table or fetched-data storage is introduced. Snapshots and forks copy
  the additive fields through their existing job-copy paths.

### Download authorization and sharing

A browser-supplied URL is untrusted. Passing a workspace base-URL check alone is
not sufficient. Before forwarding headers, the server must:

- Apply the existing report, dataset/job source-ID ownership, extension,
  connection-workspace and active-connection checks.
- Parse and normalize the recorded template and submitted URL. Their scheme,
  host, port and path must match exactly. Their query-key sets must match; keys
  must occur once. Fixed query values must match after decoding. Only complete
  values marked `{}` may differ. Fragments and userinfo remain prohibited.
- Re-run the current connection/base and header-name checks. An edited base or
  archived connection must not permit the old job to forward headers elsewhere.
- Apply the original public-address policy, redirect refusal, timeout, byte cap,
  credential scrubbing and streamed-error behavior. Never log the submitted URL
  with query values or credentials.

**Sharing changes for computed sources:** opening a report authorizes a caller to
vary the template's designated query values. The server cannot prove that a
browser evaluated the URL SQL honestly. A viewer could submit different latitude
or longitude values, but could not switch hosts, paths, query keys or fixed
values. This applies equally to sessions, device tokens, snapshots and anonymous
public readers. This is an explicit proposed tradeoff, not an exact-URL guarantee.
If authors must authorize only server-verified dataset values, this design needs
server-side evaluation of pinned inputs instead and is not ready to implement.

The download's full URL, including its `url` parameter, distinguishes browser
cache entries. Keep `Cache-Control: private, max-age=3600` and upstream validators.
Do not vary the returned body behind one cache URL. No global/server cache is added.

### Refresh, reconciliation and failure behavior

- Explicit Execute, Refresh Now and auto-refresh create a fresh computed source
  ID. Changed dependency revisions or parameter values rerun URL selection before
  fetching, even if the template itself is unchanged.
- Ordinary reconciliation reuses a source ID only when connection, template,
  normalized URL SQL and relevant dependency/parameter identity are unchanged.
  Renaming a dataset rewrites labels to the same internal ID and preserves it.
- Each reader evaluates against that job's pinned dependency revisions and bound
  parameter values. Existing HTTP dependencies are fetched live by the original
  design, so different readers may obtain different station values and therefore
  different computed URLs. This design adds no cross-reader reproducibility claim.
- Dependency failure, URL SQL error, invalid cardinality or rejected URL prevents
  the upstream fetch and clears stale published results through the existing path.
  Fetch and final-query errors use existing job error handling.
- Refresh-role users retain the ability to run saved SQL, not edit its template.
  Browser page loads and snapshots materialize the saved job as today.

### Browser, snapshot, MCP and CLI delivery

The first delivery covers the browser and the browser-based snapshot renderer.
It does not silently expose partially supported programs to other clients.

For this delivery, MCP `create_query`/`update_query` may save and validate this
syntax, but MCP `run_query` and execution-program preparation reject a query with
a computed source before scheduling it or returning a program, regardless of
`accept_duckdb_execution`. Return `Dataset-derived HTTP URLs currently require
browser execution.` Apply this to computed sources anywhere in the requested
dependency chain, not just the root query. Static-source programs keep their
existing behavior. A browser can still execute the saved query normally.

MCP/CLI execution is a separate follow-on to the original agent/CLI slice. It
must first define a positive client capability check and carry URL selection
information in `DuckDBExecutionSource`; older clients must never receive a
computed-source program as if it were a static program. No capability negotiation
or partial CLI implementation is required by this browser delivery.

### Acceptance tests

| Test | Required behavior |
| --- | --- |
| Compiler Go tests | Extract URL SQL from the supported subquery; dependencies from both phases; deterministic files; parameter binding; unchanged static-reader compilation. |
| Compiler rejection tests | Computed origin/path/key, partial placeholders, missing `url_encode`, placeholder mismatch, duplicate keys, header-name key, outer CTE reference, qualified outer reference, nested reader, multiple computed calls or mixed static/computed HTTP calls. |
| Cloud Cypress: dataset values | Create a station dataset; execute a saved TravelTime-style query against a local controlled upstream; map geometry and station fields appear. No live partner credentials required in CI. |
| Cloud Cypress: joins | URL selection can read multiple datasets; final SQL can join API response to another dataset. Zero, multiple and null selector results make no request and show the correct error. An unqualified outer-column reference fails independent binding before any request. |
| Cloud Cypress: refresh | Change station coordinates, rerun source and dependent query, observe new request values and polygon; unchanged dataset rename reuses source identity. Bind report parameters before selecting URL. |
| Cloud Cypress: failures | Dependency failure, cancellation and superseded execution cannot fetch/publish stale results. Declared and streamed fetch failures preserve existing errors. |
| Download authorization Cypress | A valid recorded template works; changed path/host/key/fixed value, duplicate key, foreign source ID, archived connection and changed base are rejected before upstream fetch. Static URL overrides are rejected. |
| Sharing/snapshot Cypress | Allowed dynamic values work for viewer, refresh-role, snapshot and anonymous public reader; an unrelated report cannot download. Different URL values never share browser cache entries. |
| MCP local Cypress | Device-authenticated `run_query` and program preparation reject computed sources anywhere in the dependency chain before scheduling or returning a program; ordinary static programs are unchanged. Saving/validating computed SQL remains possible. |

#### Controlled upstream for Cypress

There is no existing Cypress-compatible upstream injection seam: the current
handler passes a fixed production policy, and the package's `AllowAddress` seam
alone does not make it configurable from E2E. Add the following explicit internal
fetch dependency with the first failing integration test:

- The `Server` construction path accepts an HTTP-source fetch function with the
  same arguments and result as `httpsource.Fetch`. Normal app construction always
  supplies `httpsource.Fetch`; production routes and policy limits are unchanged.
- A separate Go E2E bootstrap starts the actual cloud-lane handlers and database,
  plus an `httptest` TLS upstream, then supplies a fetch function that calls
  `httpsource.Fetch` with `AllowAddress` accepting only that fixture's loopback
  address. In that test process, its cloned default HTTP transport trusts the
  fixture certificate. This does not disable certificate validation generally.
- Run cloud Cypress through the existing make wrapper against that bootstrap.
  The fixture returns TravelTime-shaped JSON based on `lat`/`lng` and exposes its
  request count and controlled error responses to the test runner on a separate
  fixture port. It receives only non-secret test header values.
- Normal server startup cannot select the fixture implementation. Add no
  production environment variable, public RPC, browser flag or request header
  that relaxes private-address or TLS checks. Verify normal startup still rejects
  a private target; keep default DNS/address and body-limit coverage in the
  existing `httpsource` package tests.

This is testing infrastructure required by this feature, not an assumed existing
seam. Cypress covers actual job/database/runtime behavior; stateless compiler and
URL/template validation can use Go contract tests.

### Implementation Plan

1. Add focused compiler acceptance/rejection tests and controlled-upstream Cypress
   tests for selection, joining and authorization; add the isolated E2E fetch
   dependency/fixture bootstrap needed to reproduce them.
2. Extend the compiler and proto descriptors for the URL SELECT and template;
   preserve literal readers and regenerate proto outputs.
3. Carry the additive descriptors through jobs, reconciliation, snapshots and
   forks in `src/server/dekart`; keep fetching out of report transactions.
4. Extend dataset-source serving with strict template validation and its
   authorization tests, reusing `src/server/httpsource` fetching policy.
5. Evaluate URL SQL after dependency materialization in the browser runtime,
   then download/register/run under the existing execution lock.
6. Verify refresh, cancellation, cache identity, sharing and snapshot behavior;
   run existing HTTP-source and DuckDB dependency regressions.
7. Reject computed executions through MCP/program preparation until the separate
   agent/CLI follow-on is implemented; verify static programs still work.

### Decisions required before implementation

- Accept or replace the sharing tradeoff: designated query values can be varied
  by any caller allowed to open the report; they are not server-proven dataset values.
- Approve the internal fetch dependency and isolated fixture bootstrap needed
  for real cloud-lane acceptance tests. No production policy bypass is included.

Out of scope: computed URL paths, per-row requests, batches of isochrones in one
query, POST bodies, automatic pagination, arbitrary hosts, server-side DuckDB
execution, server-side response storage and historical utilization analysis.

## Scope Challenge A: assessment

What already solves each sub-problem (branch `httpfs`, uncommitted):

- URL resolution and fetch policy: `src/server/httpsource` (`Resolve`, `Fetch`, `Policy.AllowAddress`). Nothing in it parses placeholders or compares a submitted URL to a recorded one.
- Static readers: `src/server/duckdbsql/compiler.go` `rewriteHTTPFunction` accepts only a constant first argument; a subquery argument is rejected today with the "needs a single quoted URL" error.
- Job records: `query_jobs.http_sources` JSON of `HTTPSourceRevision`; `duckdbcommand.go` reuses a source id on reconciliation when connection, URL and file name are equal; explicit runs get fresh ids.
- Download: `src/server/dekart/httpsource.go` finds the source on a job of the dataset, re-resolves the recorded URL against the current connection, fetches with a fixed policy, streams through with `Cache-Control: private, max-age=3600`.
- Browser: `actions/duckdb.js` downloads every `httpSourcesList` entry under the execution lock after dependency views are bound, then `executeNode` builds the parameter table and runs the SQL.
- MCP: `callRunQueryTool` lowers a DuckDB program through `lowerDuckDBExecution`; `DuckDBExecutionSource.http_source_id` carries static sources.
- Tests: cloud Cypress already downloads from `raw.githubusercontent.com/dekart-xyz/dekart/main/cypress/fixtures/`; there is no injected-upstream seam and no Go E2E bootstrap.

Minimum changes: template parsing and matching (new, pure), compiler subquery extraction, two proto fields, one query parameter on the download route, browser evaluation of the URL SQL before download, MCP rejection. Deferrable: the controlled-upstream test bootstrap (see D2), the null-flag column and the dependency-aware reuse rule (see D4).

Complexity count (plan as submitted): about 9 changed files, 0 new services, 1 new test bootstrap binary. Over the 8-file threshold, so the structure question was asked as D2 (the only arrangement difference is the test bootstrap).

Probe run during review: `duckdb v1.5.2`: `format('{}', NULL)` is NULL; `format('…lat={}&lng={}', url_encode(CAST(52.5 AS VARCHAR)), url_encode(CAST(NULL AS VARCHAR)))` is NULL; `url_encode('a b&c')` is `a%20b%26c`. A NULL argument therefore yields a NULL URL without any extra column.

Scope Challenge result: scope reduced per recommendation (D2 drops the test bootstrap; D4 drops the null-flag column and the dependency-aware reuse rule). Feature list unchanged.

## Decision ledger

### D1: Sharing tradeoff — viewers may vary the `{}` values
Options: A accept (host, path, query keys and fixed values locked by the recorded template; only designated values vary; applies to sessions, device tokens, snapshot tokens and anonymous public readers). B require server-verified values (server-side evaluation; not buildable in the browser-execution model).
Recommendation A. **Answer: A (2026-10-07).** Exposure: a viewer can spend the author's API quota on arbitrary values of one fixed endpoint.

### D2: Which requirement, if dropped, removes the most code
The injected fetch function on `Server` plus a separate Go E2E bootstrap with an `httptest` TLS upstream and fixture port. Options: A drop it; prove the behavior with a public upstream in Cypress (assert the dataset-derived value in the intercepted download `url` and that data loads) plus Go tests of the template matching. B keep it. C public echo upstream only.
Recommendation A. **Answer: A (2026-10-07).** Removed: the `Server` fetch dependency, the Go E2E bootstrap, the TLS fixture, the fixture port, the "normal startup still rejects a private target" verification. Consequence: no single Cypress run shows two coordinates producing two different polygons; the template matching is proven in Go, the end-to-end value flow in Cypress over `raw.githubusercontent.com` (which ignores query strings, so the same fixture loads for every value).

### D3: Public interface — who writes `url_encode`
Options: A compiler wraps each `format` argument in `url_encode(CAST(… AS VARCHAR))`; the author writes plain expressions. B author must write the wrapper; compiler rejects otherwise.
Recommendation A. **Answer: A (2026-10-07).** Removes the "missing url_encode" rejection and its tests. The saved SQL does not show the encoding.

### D4: Public interface — proto and reuse rule
Approve `HTTPSourceRevision.url_sql`, `url_template`, the same two on compiler `HTTPSourceRef`, and `?url=` on the download route for computed sources only, with two changes: no second boolean column in the URL SQL (NULL propagation, probe above); reconciliation reuses a computed source id under the existing rule (same connection and file name) because the file name hash covers template and URL SQL and the cache key includes the resolved URL.
Recommendation A. **Answer: A, approve with both changes (2026-10-07).**

### Review-applied changes without a separate prompt
- The template parsing and matching lives in `src/server/httpsource` as `ParseTemplate` and `Template.Match`, so the compiler and the download handler share one implementation and the Go tests are package tests, not handler tests (D2 asked for "Go handler tests"; the handler keeps only glue and is covered by the Cypress authorization spec).
- The MCP rejection is placed where the program is lowered, so a computed source anywhere in the dependency chain is rejected by one check.

## Review sections

### 1. Architecture review
- Boundaries hold: `httpsource` still knows nothing about connections, jobs or storage; the compiler keeps depending only on `httpsource` structs; `server/dekart` does orchestration. No new service, table, RPC or env var.
- Data flow: compile (server) → job record with `url_sql` + `url_template` → browser binds dependencies and parameters, runs `url_sql`, downloads `…/{source}.{ext}?url=…` → server matches the submitted URL against the recorded template and the current connection, fetches, streams → browser registers bytes and runs the final SQL. Fetching stays outside the report transaction (`duckdbcommand.go` writes records only).
- Security: the download handler must run ownership, extension, connection and template checks before decrypting headers; `?url=` on a static source is rejected; duplicate `url` parameters rejected; the submitted URL never logged with query values. Accepted exposure recorded under D1.
- Production failure per path: upstream 4xx/5xx or timeout → existing `httpSourceError` strings; URL SQL returns 0 or 2+ rows → browser error before any request; dependency fails → existing "Upstream … failed" path; connection base edited → `ParseTemplate` of the recorded template against the current base fails → 404, same as today's static behavior.
- Finding A1 (medium, high confidence): the plan's "compiler adds a boolean null column" is dead code given NULL propagation. Resolved by D4.
- Finding A2 (medium, high confidence): dependency-aware source-id reuse is unobservable: the server fetches live and the cache key includes the resolved URL. Resolved by D4.
- Finding A3 (low): the plan's `Server` fetch dependency and E2E bootstrap are a second construction path kept for tests. Resolved by D2.

### 2. Code quality review
- Shared code: one template implementation (`ParseTemplate`, `Match`) used by the compiler and the handler; the rubric passes (common behavior, two callers, security-relevant to keep identical).
- Finding Q1 (medium): the plan required authors to write `url_encode(CAST(x AS VARCHAR))` exactly, which is a rejection rule for text the compiler can emit. Resolved by D3.
- Finding Q2 (low): the plan listed "escaped braces, partial values and repeated parameter names" as unsupported; that is the natural result of "a `{}` is one complete query value", so one rule replaces three.
- No new jargon: the finalized plan reuses "template", "URL SQL", "computed source" from the submitted plan and "source id", "file name", "dependency revisions" from the code.

### 3. Test review
Behaviors and the test that catches each regression:
- Template shape and matching → `src/server/httpsource` Go tests (12 cases).
- Compiler extraction, wrapping, dependency merge, rejections, static readers unchanged → `compiler_test.go` (10 cases).
- URL evaluated from dataset values, join with another dataset, cardinality and NULL errors with no download, refresh with changed values, rename keeps the source id → cloud Cypress over the public fixtures base (6 cases).
- Download authorization with a tampered `url` → cloud Cypress route requests (5 cases), following the existing "foreign source id" pattern.
- MCP rejection and save/validate → local Cypress through the device flow (3 cases).
- Regressions: `httpSource.cy.js`, `httpSourceCredentials.cy.js`, `TestCompileHTTPReaders`, `TestCompileRejectsUnsafeSQL`, `duckdbRefresh*.cy.js`.
Dropped tests: the controlled-upstream request-count and error-injection cases (D2); the null-flag column cases (D4); the "missing url_encode" rejection (D3).

### 4. Performance review
- One upstream request per materialization per browser, unchanged from the static design; the browser cache separates entries by resolved URL. No new server work besides parsing two URLs per download.
- The URL SQL runs over already-materialized dependency views in the browser; for the station example it is a one-row filter. No concern.

## Outside voice (Codex, codex-cli 0.160.0, read-only, completed 2026-10-07)

Ran against the finalized plan after D1-D4. Seven findings; dispositions:

1. Medium, accepted: MCP rejection must run before warehouse leaves launch. Evidence: `duckdbprepare.go` runs `runQuery` per leaf at line 301 and lowers at line 354. Plan now rejects on the first captured graph; MCP spec asserts no leaf job is created.
2. Medium, accepted: the handler obtains header names only by decrypting the header map, so "validate before decrypting" was wrong. Plan now keeps the existing order: authorize, decrypt, parse template and match, fetch.
3. Medium, accepted: a UUID cannot expose a missing encoding. The Cypress value now contains `&`, `=` and a space and the test asserts the decoded `url` equals it.
4. Medium, accepted: added Cypress cases for a parameter change in the subquery predicate and an edited upstream dataset.
5. Low, accepted: no dedicated outer-reference analysis; the subquery compiles in its own scope, outer CTE names hit the existing unknown-dataset error, outer columns fail in the browser binder. Compiler rejection cases reduced to 9.
6. Low, agrees with D1/D4: one strict matcher, no signatures or dependency-sensitive source identities.
7. Low, agrees with D2/D3.
Codex verdict before the folds: not ready on 1, 2 and 4. All three are folded; no open items remain from the outside voice.

## Approval readiness

D1-D4 answered; outside-voice findings 1-5 applied as plain corrections (no interface change: `ParseTemplate`, `Match`, proto fields and the `url` parameter are as approved in D4). The plan file holds only the finalized design; this record holds the history. Original design `../../magic/docs/designs/duckdb-http-sources.md` updated with the additive fields and the computed-URL rules.

## Implementation Tasks

See the plan's slices 1-3. No TODOS.md entries added.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | not run | — |
| Outside Review | codex (`codex exec`, read-only) | Independent 2nd opinion | 1 | completed | 7 findings, 5 accepted and folded, 2 agreements |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 (not persisted in the gstack dashboard) | CLEAR | 6 issues, 0 critical gaps, mode: scope reduced per recommendation |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | not run (no UI change) | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | not run | — |

- **OUTSIDE COVERAGE:** codex, plan challenge phase, completed; findings listed above, all folded.
- **CROSS-MODEL:** native review (Claude Fable 5.1) and Codex agreed on D1-D4; Codex added the MCP ordering, decryption order, encoding test value and parameter/dependency cases.
- **VERDICT:** ENG CLEARED — ready to implement.

NO UNRESOLVED DECISIONS
