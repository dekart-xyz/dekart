Plan: /Users/vladi/dev/magic/docs/designs/geosql-server-mvp-spec.md — Slice 2

## 2026-10-14

- Tests: P1 passed in Chrome: six keepalives at 15-second intervals, stream open for 100 seconds. A5/A6 Go tests cover device bearers in Google/OIDC/IAP/ALB, role checks, forwarding, 502 JSON, CORS, return origins and the 100-second routed stream.
- Tests: `go test ./...`, affected-package `go vet`, and `git diff --check` passed. Browser device authorization passed via `make cypress-run ENV_FILE=.env.local SPEC="cypress/e2e/local/tmpAgentDevice.cy.js"`.
- E2E video: /Users/vladi/dev/dekart-b/cypress/videos/tmpAgentDevice.cy.js.mp4 (temporary ignored spec).
- Harness: existing PostGIS harness called the new Google-mode backend's `/api/v1/agent/chat` with the browser-issued device bearer; stream/snapshot/report passed, Claude Code baseline exited 0, total 177.7 seconds. Markers visually verified.
- Evidence: /tmp/dekart-b-harness-results/; report http://127.0.0.1:8080/reports/6b0ffa26-eba9-413f-9e44-858affde202a; logs /tmp/dekart-b-{p1,harness,verified-go,vet,device-cypress}.log.
- Review: clean independent correctness review; all findings fixed, including removed-member rejection, same-origin login compatibility, and refusing unverified ALB bearers.
- Deviation: ALB agent access requires a verified device bearer. Direct ALB IdP bearers need trusted-signer configuration absent from the approved interface; existing ALB proxy authentication is preserved. OIDC and IAP accept their validated IdP bearers.
- Files outside plan: this handoff report; optional `DEKART_AGENT_URL` documented in `.env.example`. Existing CORS already allowed the configured app origin; added a route preflight test.
- Refactor candidates: none identified; no new dependencies or generated-file edits. Changes are uncommitted.
- Known limitation: downstream agent CLI and baseline still used the existing development-mode Dekart container; this run proves the new Google-mode entry route, not a fully Google-authenticated Compose stack. Earlier device-flow attempts lacked accepted fixture membership; final run passed after adding it locally.
- Open question: approve trusted ALB signer configuration if direct ALB IdP bearer support is required beyond A5's device-token acceptance.
