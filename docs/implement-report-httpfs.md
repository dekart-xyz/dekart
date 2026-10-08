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
