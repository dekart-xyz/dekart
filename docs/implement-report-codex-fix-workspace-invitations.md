Plan: the three workspace invitation bugs reported in this chat; no separate plan file.

## 2026-10-21

- Tests: reproduced all three failures on local Cloud/Postgres before fixing them. Final adjacent Cloud run: 17/17 Cypress tests passed across workspaceInvitations, trialAcknowledgement, readOnlyMemberRoles, and workspaceCreateFromMembers. Final invitation-only run also verifies the anonymized fixtures.
- Tests: 175 frontend tests passed; frontend lint and `go test ./src/server/dekart ./src/server/user` passed. `git diff --check` passed. No generated files changed.
- Review: fixed the review finding about mixed-case admins changing/removing themselves; fresh final correctness review found no actionable issues.
- Behavior: invitation discovery and accepted membership lookup ignore email case; Join and invitation routes bypass the Personal trial gate; invitation URLs open the existing Join view; acceptance selects the joined workspace; copied URLs use the canonical invitation path without query or hash.
- Deviations: preserved case-insensitive self-membership protection and replaced saved Personal workspace selection when accepting an invitation, both required for the corrected flow.
- Files outside the bug paths: registered the regression spec in the existing Cloud CI lane; this handoff report.
- Refactor candidates: none introduced. Existing workspace responsibilities remain together.
- Known failures out of scope: none in final checks. Concurrent invitations and pre-existing duplicate memberships with different casing were not tested.
- Open questions: none. Changes remain uncommitted on `codex/fix-workspace-invitations`; no deployment or production account changes.
- Cypress video: [workspaceInvitations.cy.js.mp4](/Users/vladi/dev/dekart/cypress/videos/workspaceInvitations.cy.js.mp4).
