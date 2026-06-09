# Disable BigQuery OAuth in No-Config

## Context

In self-hosted no-config Dekart, Google OAuth is not configured, but the BigQuery connection modal still exposes the OAuth passthrough path. Users can click "Connect with Google" and enter a path that cannot work in this runtime, making the product look broken.

Verified on 2026-06-09:

| File | Current behavior |
| --- | --- |
| `src/client/CreateConnection.jsx` | The BigQuery card is always shown and opens the BigQuery connection method modal. This should stay unchanged. |
| `src/client/BigQueryConnectionTypeSelectorModal.jsx` | "Connect with Google" always dispatches `newConnection(CONNECTION_TYPE_BIGQUERY)`. |
| `src/client/reducers/rootReducer.js` | `env.googleOAuthEnabled` is true only when `REQUIRE_GOOGLE_OAUTH === '1'`. |
| `src/client/BigQueryConnectionTypeSelectorModal.jsx` | "Configure Service Account" dispatches `newConnection(CONNECTION_TYPE_BIGQUERY, true)`. This should stay enabled. |

## Proposed Change

Use the existing `env.googleOAuthEnabled` Redux state in `BigQueryConnectionTypeSelectorModal`.

When `googleOAuthEnabled` is false:

- Disable only the "Connect with Google" button.
- Show an Ant Design tooltip with exactly: `Google OAuth is not configured for this Dekart instance`.
- Keep the BigQuery card clickable.
- Keep "Configure Service Account" enabled.
- Do not add backend/API enforcement.

When `googleOAuthEnabled` is true:

- Preserve the current "Connect with Google" behavior.

## Acceptance Criteria

1. In no-config/self-hosted mode where `REQUIRE_GOOGLE_OAUTH` is absent or not `1`, the BigQuery connection method modal still opens.
2. In that modal, "Connect with Google" is disabled.
3. Hovering the disabled OAuth option shows `Google OAuth is not configured for this Dekart instance`.
4. "Configure Service Account" remains enabled and still opens the BigQuery service-account flow.
5. When `REQUIRE_GOOGLE_OAUTH=1`, "Connect with Google" remains enabled and dispatches the existing OAuth BigQuery setup flow.
6. No backend/API guard is added.

## Testing Plan

| Layer | Check |
| --- | --- |
| Static | Run frontend lint or the narrowest available frontend check for the changed JSX. |
| Cypress regression | Update the existing local BigQuery connection-name retest so local/no-config asserts the Google OAuth button is disabled instead of clicking it. Keep the service-account retest in the same spec. |
| Manual browser QA | Run no-config locally, open connection setup, click BigQuery, verify the disabled Google OAuth button tooltip and enabled service-account button. |

No new Cypress spec is planned because the requested validation is one-time browser validation via gstack QA or Chrome CDP. Existing Cypress coverage must still be kept compatible with the new no-config behavior.

## Rollback Plan

Revert the change in `src/client/BigQueryConnectionTypeSelectorModal.jsx`. No data, backend, or configuration changes are involved.

## Files

| File | Change |
| --- | --- |
| `src/client/BigQueryConnectionTypeSelectorModal.jsx` | Read `env.googleOAuthEnabled`, disable/wrap "Connect with Google" with a tooltip when OAuth is unavailable. |
| `cypress/e2e/local/bigQueryServiceAccountNameRetest.cy.js` | Preserve the service-account retest and replace the local OAuth click path with disabled-button assertions. |

## Out of Scope

- Hiding or disabling the BigQuery card.
- Disabling the service-account path.
- Adding backend/API enforcement.
- Adding new environment variables.
- Adding reusable Cypress coverage.
