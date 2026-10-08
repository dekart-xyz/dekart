## 2026-10-08 — Connections page layout
Mockup: `/Users/vladi/Downloads/Connections page rebuild with API.zip` (`Connections.dc.html`) and attached screenshot; no committed implementation plan.
- Tests: cloud Cypress `connectionSelectorLayout.cy.js` — 2 passing; initial run failed on the old title and missing sections.
- Tests: `npm run lint` passed; `npm test -- --run src/client/OtherConnectorModal.test.jsx` — 2 passing; `git diff --check` passed.
- Cypress verifies warehouse/API grouping, connector dialogs, overflow dialog, and four/two/one columns at 1280/700/375px.
- Video: `cypress/videos/connectionSelectorLayout.cy.js.mp4`; screenshots: `cypress/screenshots/connectionSelectorLayout.cy.js/`.
- Clean review: no correctness findings in the four layout/code/test files.
- Deviations: retained existing warehouse logos, Back action and self-hosting link; used the ZIP HTML as layout specification.
- Files: `src/client/CreateConnection.jsx`, `src/client/CreateConnection.module.css`, `src/client/HomePage.module.css`, `cypress/e2e/cloud/connectionSelectorLayout.cy.js`.
- Files outside mockup scope: this hand-off report; no backend or generated files changed in this turn.
- Refactor candidates: none introduced.
- Known failures outside scope: reviewer identified existing HTTP-source design gaps in MCP header-name discovery, HTTP URL autocomplete, and DuckDB/S3/GCP request-modal routing. These were not implemented or changed by this layout request.
- Open questions: none for the layout. Changes remain unstaged and uncommitted on `httpfs`.

## 2026-10-08 — Consistent HTTP source icons
Request: make the saved HTTP connection icon match the selector globe; screenshot supplied in chat.
- Tests: cloud Cypress `connectionSelectorLayout.cy.js` — 3 passing, including a regression that failed on the missing saved-card globe before the fix.
- Tests: `npm run lint` passed; adjacent `OtherConnectorModal.test.jsx` — 2 passing; `git diff --check` passed.
- Video: `cypress/videos/connectionSelectorLayout.cy.js.mp4`.
- Clean review: no correctness findings in the icon/layout files.
- Deviations: none; both locations now use the shared `DatasourceIcon` HTTP globe, with the same blue color.
- Files outside the original layout scope: `src/client/Datasource.jsx`, `src/client/Datasource.module.css`; also updated the selector, its Cypress spec and this report.
- Refactor candidates: none.
- Known failures outside scope: reviewer identified pre-existing HTTP buffer retention in `src/client/lib/duckdb/runtime.js:402`: files are registered by filename but dataset cleanup uses dataset ID, retaining old downloads until report teardown. Not changed by this icon fix.
- Open questions: none. Changes remain unstaged and uncommitted on `httpfs`.

## 2026-10-08 — Compact connections page header
Mockup: `/Users/vladi/Downloads/Connections page rebuild with API-3.zip`, `Connections.dc.html`; scope confirmed as connections page only.
- Tests: cloud Cypress `connectionSelectorLayout.cy.js` — 3 passing; new header check failed on the old subtitle before implementation.
- Tests: `npm run lint` passed; adjacent `OtherConnectorModal.test.jsx` — 2 passing; `git diff --check` passed.
- Coverage: Back appears above the title, returns from new-connection setup to saved cards, compact icon/title sizes, no subtitle, responsive columns, connector dialogs and consistent HTTP icons.
- Video: `cypress/videos/connectionSelectorLayout.cy.js.mp4`; desktop/mobile screenshots in `cypress/screenshots/connectionSelectorLayout.cy.js/`.
- Clean review: no findings in this iteration.
- Deviations: existing warehouse logos and original Back visibility/navigation behavior retained. Editor panel mockup excluded as requested.
- Files: `src/client/CreateConnection.jsx`, `src/client/CreateConnection.module.css`, `cypress/e2e/cloud/connectionSelectorLayout.cy.js` and this report. No other files touched in this turn.
- Refactor candidates: none introduced.
- Known failures outside scope: pre-existing HTTP buffer-retention finding from the previous report remains unchanged.
- Open questions: none. Changes remain unstaged and uncommitted on `httpfs`.

## 2026-10-08 — New dataset panel
Mockup: `/Users/vladi/Downloads/Connections page rebuild with API-3.zip`, `Connections Panel v2.dc.html`, and screenshot supplied in chat.
- Tests: cloud `datasetSelectorLayout.cy.js` — 3 passing; `connectionSelectorLayout.cy.js` — 3 passing. Initial panel test failed on missing File group; added horizontal-alignment check failed before CSS specificity fix.
- Tests: `npm run lint` and `git diff --check` passed. No Go or pure function changes; UI behavior verified with Cypress.
- Coverage: File/Query groups, row arrows and alignment, no horizontal overflow at 1280/900px, upload, README, DuckDB, HTTP query initialization, connection-management navigation.
- Video: `cypress/videos/datasetSelectorLayout.cy.js.mp4`; screenshot: `cypress/screenshots/datasetSelectorLayout.cy.js/new-dataset-panel.png`.
- Clean review: no findings in the panel/layout changes.
- Deviations: retained existing Docs links and permission gates. HTTP base URLs display host/path without the protocol or trailing slash, as in the mockup.
- Files: `src/client/Dataset.jsx`, `src/client/Dataset.module.css`, new `cypress/e2e/cloud/datasetSelectorLayout.cy.js`, existing `cypress/e2e/cloud/httpSource.cy.js` subtitle assertion, this report.
- Tests outside focused coverage: full HTTP-source execution spec not rerun; its changed host-label expectation is covered by the new panel spec. Network/download behavior unchanged.
- Refactor candidates: none introduced.
- Known failures outside scope: reviewer found pre-existing HTTP save error handling leaves loading=true on server validation failures (`HTTPConnectionModal.jsx:35`, `actions/connection.js`); invalid URL correction requires closing/reopening the modal. Previous HTTP buffer retention finding also remains unchanged.
- Open questions: none. Changes remain unstaged and uncommitted on `httpfs`.

## 2026-10-08 — Dataset panel alignment adjustments
Mockup: `/Users/vladi/Downloads/Connections page rebuild with API-4.zip`, `Connections Panel v2.dc.html` and attached screenshot.
- Tests: cloud `datasetSelectorLayout.cy.js` — 3 passing; updated visual check failed on uppercase headings before implementation. Existing actions, horizontal alignment and 900px overflow checks pass.
- Checks: `npm run lint` and `git diff --check` passed. CSS-only product change; no Go or unit behavior changes.
- Video: `cypress/videos/datasetSelectorLayout.cy.js.mp4`; screenshot: `cypress/screenshots/datasetSelectorLayout.cy.js/new-dataset-panel.png`.
- Review: no new layout findings.
- Deviations: retained existing shared icon artwork and actions.
- Files: `src/client/Dataset.module.css`, `cypress/e2e/cloud/datasetSelectorLayout.cy.js`, this report; no files outside the requested panel scope except the report.
- Refactor candidates: none.
- Known failures outside scope: previously reported HTTP validation/save loading issue remains unchanged.
- Open questions: none. Changes remain unstaged and uncommitted on `httpfs`.

## 2026-10-08 — Remove HTTP card Docs link
Request: remove the Docs link from the dataset panel card.
- Tests: existing cloud `datasetSelectorLayout.cy.js` — 3 passing. First run hit a React update loop during setup; restarting via `make client` resolved it.
- Checks: `npm run lint` and `git diff --check` passed; review found no new issue in this change.
- Video: `cypress/videos/datasetSelectorLayout.cy.js.mp4`.
- Deviations: removed link as explicitly requested; saved Docs URL and connection form unchanged.
- Files: `src/client/Dataset.jsx` and this report. No other files touched.
- Refactor candidates: none.
- Known failures outside scope: existing HTTP save-validation loading issue remains unchanged.
- Open questions: none. Changes remain unstaged and uncommitted on `httpfs`.
