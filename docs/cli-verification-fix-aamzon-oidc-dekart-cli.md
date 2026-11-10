# Amazon OIDC CLI verification — 10 November 2026

Local server: Amazon OIDC required, `AWS_REGION=eu-central-1`, SQLite metadata, local file storage, license loaded from the existing local configuration. No real load balancer was used.
The real CLI ran from `../dekart-cli` through its existing Python environment, with `XDG_CONFIG_HOME=/tmp/dekart-amazon-cli-config` and telemetry disabled. A real Chromium page approved the device with the development identity header; subsequent CLI operations used only the issued device credential. The snapshot page used only its snapshot credential.

## Init output

Command: `dekart init --no-browser --local-snapshot install --bigquery-passthrough disable`

```text
Finalizing setup...
Done. Authenticated as amazon-cli@example.com
Token saved: /tmp/dekart-amazon-cli-config/dekart/token.json

Hey, success!
Setup summary:
  Endpoint: http://localhost:8080
  Account: amazon-cli@example.com
  Config: /tmp/dekart-amazon-cli-config/dekart/config.json
  Token: /tmp/dekart-amazon-cli-config/dekart/token.json
  BigQuery passthrough: disabled
  Local snapshot: enabled
You can run `dekart init` again anytime.
```

## Verification results

```text
dekart init: authorized through browser; token saved in isolated temporary config; local Chromium available
dekart tools --json: 24 tools returned
dekart upload-file --max-part-size 32: multipart upload completed
Device-token download: uploaded CSV matches all 66 bytes
dekart run-query --json: local DuckDB execution and result download completed
dekart preview: Berlin and Munich present in downloaded result
dekart snapshot: local Chromium rendered /tmp/dekart-amazon-cli-snapshot.png
```

The run created a report, a `cities.csv` dataset and a DuckDB dataset through real `dekart call` commands. The query selected both cities and shifted longitude by 0.5 degrees. `dekart run-query --json` executed it locally, and `dekart preview` confirmed Berlin and Munich in the downloaded result. The Cypress regression uses a larger five-degree shift so it can assert the relative positions of the drawn layers.

CLI image: `/tmp/dekart-amazon-cli-snapshot.png`.
Cypress video: `cypress/videos/cliAndSnapshot.cy.js.mp4`.
Cypress map capture: `cypress/screenshots/cliAndSnapshot.cy.js/amazon-oidc-map-points.png`.

No PR exists for this branch yet. This evidence is ready to paste into its PR; it has not been published.
