# DuckDB First-Run UX Implementation Plan

## Goal

Make the DuckDB query entry point useful on first click: the default example must reference the first usable report dataset or fall back to runnable point-generating SQL, `datasets.` must autocomplete report tables, and the DuckDB selector must use the supplied DuckDB logo.

## Evidence

- `src/client/Query.jsx:144-181` enables Ace completion but reads only the static completer from datasource metadata and registers it globally.
- `src/client/Query.jsx:409-471` inserts the datasource sample without considering report contents.
- `src/client/lib/datasource.js:107-114` hardcodes DuckDB SQL against `datasets."Dataset 1"`, although actual labels come from `src/client/lib/getDatasetName.js:1-16` as uploaded filenames, explicit names, or `Query N`.
- `src/server/duckdbsql/compiler.go:212-218` rejects missing labels and labels shared by multiple datasets.
- `src/client/Dataset.jsx:109-122` already renders DuckDB through `DatasourceIcon`, but DuckDB metadata has no icon style, so `src/client/Datasource.jsx:28-39` renders the generic SQL icon.
- Historical commit `8cc374e` proves Ace can suggest report datasets, but its implementation checks a removed DuckDB connection enum, limits triggering to `FROM/JOIN`, and risks retaining per-editor completers in Ace's global registry.
- `cypress/e2e/local/duckdb.cy.js` already covers file-backed and chained browser-local queries. `cypress/e2e/bq/duckdbRefresh.cy.js` already covers warehouse-backed DuckDB dependencies.

## Behavior Contract

### Addressable source catalog

Build one ordered DuckDB source catalog from `state.dataset.list`:

1. Resolve labels for every report dataset with `getDatasetName`, including the current dataset and empty `New` placeholders. Count ambiguity across this full label map so the client matches `duckdbcommand.go` and the compiler.
2. Return only datasets that are not the current dataset and have a real query or file source.
3. Omit a returned source when its label occurs more than once in the full label map. This includes collisions caused by the current dataset or an empty placeholder.
4. Preserve `state.dataset.list` order for default-example selection. Ace may apply its native relevance/alphabetical ordering in the popup because suggestion order is not a product requirement.

Autocomplete uses this structural catalog without interpreting execution health. Do not reproduce dependency-graph validation or runtime readiness in the completer; the existing server/compiler remains authoritative.

### Default example

For an empty DuckDB editor, keep the existing “Start with a sample query” interaction. Preserve current precedence: `UX_DATA_DOCUMENTATION` still replaces the sample action, and an explicit `UX_SAMPLE_QUERY_SQL` still overrides datasource-generated SQL. The dynamic DuckDB behavior applies when neither environment override is configured.

- Starting from the structural catalog, keep only sources the server can pin now, then skip known errors. Use the first remaining entry in report order and insert:

```sql
SELECT *
FROM datasets."<escaped label>"
LIMIT 100;
```

- Escape embedded double quotes by doubling them.
- If no usable non-error source remains, insert a self-contained DuckDB query that returns exactly 100 rows with numeric `latitude` and `longitude` columns:

```sql
SELECT
    random() * 180 - 90 AS latitude,
    random() * 360 - 180 AS longitude
FROM range(100);
```

The fallback must pass the existing DuckDB compiler and reach visible `Ready` state in Cypress.

Usability and known-error filtering are deliberately limited to default selection:

- A file is usable only after the existing file record reports stored status. Empty and in-progress uploads are skipped because `resolveDuckDBRevisionsTx` rejects them rather than waiting.
- A query is usable only when an active `queryJob` exists for its query ID and current `queryParams.hash`. Empty queries without a job are skipped because the server cannot pin a revision.
- A query with an active pending/running job remains usable because its revision can be pinned and the existing graph can wait for it.
- A query of any execution engine is errored when its active job has `jobError`.
- A DuckDB query is also errored when the matching `duckDBJobStates[job.id].status` is `DUCKDB_JOB_STATUS_ERROR`.

### Ace autocomplete

- Apply the dynamic completer only to DuckDB query editors.
- Trigger case-insensitively whenever the text immediately before the cursor ends with `datasets.`. Do not require `FROM` or `JOIN`.
- Open Ace's standard completion popup after the dot and return the addressable source-catalog entries. Accept Ace's native popup ordering.
- Insert only the quoted table identifier, for example `"Query 1"`, so the editor becomes `datasets."Query 1"`.
- Attach the dynamic completer to the current Ace editor instance and remove or replace it during editor lifecycle changes. Do not append per-query completers to Ace's global registry.
- Leave the existing BigQuery, Snowflake, and Wherobots completers unchanged.

### DuckDB logo

- Use the supplied DuckDB light-mode SVG verbatim as `src/client/duckdb.svg`.
- Add `style: 'duckdb'` to DuckDB datasource metadata and a `.duckdb` background-image rule matching the sizing conventions in `Datasource.module.css`.
- The DuckDB dataset-selector button must render the supplied SVG instead of `ConsoleSqlOutlined`.

## Important Constraints

- Client-only change. Do not modify proto, RPC, server compiler, DuckDB runtime, persistence, migrations, or environment configuration.
- Reuse `getDatasetName`, existing Redux state, React hooks, Ace language tools, and the existing datasource-icon pattern. Add no dependency or new state store.
- Keep catalog construction, SQL identifier escaping, completion, and sample-source readiness in one focused DuckDB helper. Keep the sample-query UI in its own component and do not couple autocomplete to async execution state.
- Follow `AGENTS.md`: add a short purpose comment for every new non-trivial function and conditional branch.
- Cypress must assert visible editor text, popup content, query status, row count, and rendered icon. Do not assert Redux internals.

## Implementation Plan

1. Add the supplied `src/client/duckdb.svg` and wire the existing datasource icon path through `src/client/lib/datasource.js` and `src/client/Datasource.module.css`.
2. Add a focused DuckDB dataset helper that builds the structural catalog, quotes identifiers, installs report-aware Ace completion, and selects a ready sample source.
3. Update `QueryEditor` in `src/client/Query.jsx` to install the adapted historical completer directly on the DuckDB Ace instance, trigger after any case variation of `datasets.`, and preserve Ace defaults plus existing warehouse completers.
4. Extract `SampleQuery` to `src/client/SampleQuery.jsx`; preserve environment override precedence, choose the first ready catalog entry or the 100-point fallback, and remove the invalid static DuckDB sample from datasource metadata.
5. Extend DuckDB Cypress coverage with logo, sample, autocomplete, quoted-label, ambiguity, fallback, errored-first/next-usable, and cross-engine editor-lifecycle assertions while retaining existing scenarios.
6. Run client lint and the focused local DuckDB Cypress spec through the documented `.env.local` runtime; preserve the Cypress video as verification evidence.

## Cypress Scenarios

| Lane | Scenario | Required visible proof |
|---|---|---|
| local | Existing uploaded-file/chained-DuckDB flow | Logo renders; sample selects the first usable source; `datasets.` popup lists file and DuckDB sources; quoted selection executes and reaches `Ready` |
| local | Catalog edges folded into the existing flow | A colliding label is omitted; a label containing `"` inserts doubled quotes; both the quoted sample and ambiguity fallback execute to `Ready` |
| local | No source exists | The self-contained fallback executes and returns 100 rows with latitude and longitude columns |
| local | First query fails and a later file source exists | Default selection skips the failed DuckDB query, references the stored file, and executes to `Ready` |
| BigQuery | Switch directly between warehouse and DuckDB query tabs | Report-dataset completion appears only in DuckDB and is restored after switching back |

The BigQuery lifecycle scenario protects the editor-instance cleanup required when React reuses the same Ace editor across query engines.

## Verification Commands

Run commands from the repository root using the runtime configuration required by `AGENTS.md` and `skills/cypress-quick-start/SKILL.md`:

```bash
npm run lint
make up-and-down
make server .env.local
make client
set -a
. ./.env
. ./.env.local
set +a
ELECTRON_RUN_AS_NODE= npx cypress run --spec "cypress/e2e/local/duckdb.cy.js"
```

Run the server and client in separate long-lived terminals before Cypress. Do not rebuild Docker images. If implementation unexpectedly changes `cypress/e2e/bq/duckdbRefresh.cy.js`, also run that spec with its matching BigQuery environment.

## Acceptance Criteria

1. With default UX configuration, every new DuckDB editor offers a sample that references the first pinnable, non-error source or generates 100 runnable points when none exists; explicit documentation/sample environment overrides retain current precedence.
2. Files, warehouse query results, and DuckDB results are structurally addressable; the current dataset and empty placeholders are not returned, while every report dataset still participates in duplicate-label detection.
3. Default selection skips unstored files, queries without a current-parameter job, any active job with `jobError`, and DuckDB jobs with a local error state. Pending and running query jobs remain eligible in report order. Autocomplete continues to list structurally addressable sources regardless of execution state.
4. Any case variation of `datasets.` opens Ace suggestions, and selection inserts a correctly escaped quoted label.
5. DuckDB completion remains instance-scoped, restores Ace's default completers outside an unfinished `datasets.` identifier, and existing warehouse completer code remains untouched.
6. The DuckDB selector uses the supplied SVG at the existing datasource-icon dimensions.
7. Focused Cypress coverage passes with user-visible assertions; unchanged DuckDB execution/runtime behavior remains green.

## Out of Scope

- Column or SQL-function completion
- Suggestions for schemas other than `datasets`
- Dataset renaming or duplicate-resolution UX
- Predicting indirect dependency cycles in the client
- DuckDB execution/runtime, server validation, or persistence changes
- Changes to non-DuckDB sample queries
