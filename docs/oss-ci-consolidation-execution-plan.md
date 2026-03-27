# OSS CI Consolidation Execution Plan

## Goal

Move from a two-repository CI model (`oss` + `premium`) to a single-repository model in `oss`, while preserving external behavior:

- OSS builds/tests continue to run.
- Premium builds/tests also run from the OSS repository.
- Premium images are still pushed to the existing premium registry location.
- Cloud images are built/pushed from OSS, and deployment PRs continue to be created in the deployment repo.

## Desired End State

- CI/CD is orchestrated only from the OSS repository.
- Repository flavor detection is removed from runtime decision logic.
- Build destination is selected explicitly by workflow/job intent (`oss`, `premium`, `cloud`), not by repository name.
- PR and `main` flows run all required validations and produce the same deliverables users already consume.

## Scope of Workflow Changes

- `.github/workflows/flavour.yaml`
- `.github/workflows/build.yaml`
- `.github/workflows/e2e.yaml`
- `.github/workflows/pull_request.yaml`
- `.github/workflows/push.yaml`
- `.github/workflows/release.yaml`
- `.github/workflows/create-pulumi-pr.yaml`

## Execution Plan

### Phase 1: Remove repo-flavor coupling

1. Replace implicit flavor detection with explicit targets:
  - Stop deriving behavior from `github.repository` (currently in `flavour.yaml`).
  - Pass target(s) directly from caller workflows.
2. Decommission `flavour.yaml` from all callers:
  - `pull_request.yaml`, `push.yaml`, `release.yaml` should not depend on `flavour` outputs.
3. Keep `changes.yaml` logic unchanged initially to minimize risk.

Exit criteria:

- No workflow depends on `is_premium`/`is_oss`.
- All target routing is explicit in each job definition.

### Phase 2: Make build routing explicit and stable

1. Update `build.yaml` registry mapping so destination registry is independent from current repo:
  - `oss` -> Docker Hub (`dekartxyz/dekart`) (unchanged behavior).
  - `premium` -> `ghcr.io/<owner>/dekart-premium/dekart` (same canonical path implied by previous `premium` repo workflow behavior, where `REG=ghcr.io/${{ github.repository }}` and `github.repository` was `<owner>/dekart-premium`).
  - `cloud` -> GAR (`europe-west3-docker.pkg.dev/dekart-cloud/dekart/dekart`) (unchanged behavior).
2. Ensure `premium` path no longer uses `ghcr.io/${{ github.repository }}` if that points to OSS namespace.
3. Keep build cache refs aligned per destination to avoid cross-target cache collisions.
4. Validate auth per target:
  - Docker Hub creds for `oss`.
  - Dedicated GHCR credentials for premium namespace push from OSS.
  - GCP service account for GAR.

Exit criteria:

- Test push and app push succeed for all three targets from OSS workflows.
- Image coordinates for premium/cloud remain user-compatible.

### Phase 3: Run premium + OSS tests from OSS workflows

1. `pull_request.yaml`:
  - Keep `node_tests` and `go_tests`.
  - Build E2E image in OSS workflow context.
  - Run premium E2E suites (`google-oauth`, `bq`, `athena`, `snowflake-*`) from OSS repo.
  - Do not publish premium/cloud release images from PR workflows.
2. `e2e.yaml`:
  - Keep premium and cloud suites callable as separate target lanes.
  - Ensure image pre-pull references new explicit registry mapping.
3. Preserve secret usage expectations for premium/cloud suites; verify secrets are available in OSS repo settings/environment.

Exit criteria:

- PRs in OSS run all required E2E coverage previously run in premium repo.
- No failing suite due to missing secret or wrong registry pull path.

### Phase 4: Move cloud release + deploy PR handoff fully to OSS

1. `push.yaml` on OSS `main`:
  - Run tests.
  - Build cloud app image (`target: cloud`).
  - Trigger deployment PR creation workflow after successful checks.
2. `create-pulumi-pr.yaml`:
  - Keep deployment repo flow unchanged.
  - Ensure commit metadata in PR body references OSS source commit.
3. Keep cloud publishing behavior on `main` only (same current behavior intent), followed by deploy PR creation.

Exit criteria:

- OSS `main` pushes cloud image and creates deployment PR in `dekart-cloud-deploy`.
- Deployment team sees no functional difference in downstream update flow.

### Phase 5: Release workflow alignment and cleanup

1. `release.yaml`:
  - On git tag, publish both OSS and premium images with the exact same version tag.
  - Do not publish cloud from tag workflow.
  - Keep release artifact naming/tagging consistent with existing consumer expectations.
2. Remove obsolete flavor abstractions and dead conditionals.
3. Add comments in workflows where target routing is non-obvious.

Exit criteria:

- Tag-based releases from OSS publish all required images to expected registries.
- No flavor-specific conditional branches remain.

## Validation Plan

- Dry run on feature branch in OSS:
  - Verify `node_tests`, `go_tests`, `build_e2e`, `e2e_tests`.
- Controlled `main` run:
  - Verify premium image push path.
  - Verify cloud image push path.
  - Verify deployment PR auto-creation.
- Release tag simulation:
  - Verify image tags and registries for each target.

## Rollout Strategy

- Stepwise rollout behind workflow edits in one PR.
- Merge with temporary observability:
  - Keep existing artifact uploads on failure.
  - Add temporary logging for resolved registry/tag values.
- Fast rollback:
  - Revert workflow PR if premium/cloud pushes fail in production run.

## Decisions Captured

1. **Premium registry canonical path**
  - Keep premium images at `ghcr.io/<owner>/dekart-premium/dekart` ( ghcr.io/dekart-xyz/dekart-premium/dekart)

2. **Premium push credentials from OSS**
  - Add dedicated OSS secrets for premium GHCR push:
    - `PREMIUM_GHCR_USERNAME`
    - `PREMIUM_GHCR_TOKEN` (PAT with package write permissions for the premium namespace)

3. **PR behavior**
  - PR workflows run tests/build validation only.
  - Publishing stays on `main`/tag flows.

4. **Release matrix**
  - On git tag: publish OSS + premium with identical version.
  - On merge to `main`: publish cloud image and create PR in deployment repo.

5. **Premium repo future state**
  - Premium repo remains for docs/images/licenses.
  - CI/build code duplication between repos should be reduced to zero.

## Required OSS Secrets Checklist

The OSS repository must contain all secrets needed by migrated workflows:

1. **Registry and package publishing**
  - `DOCKERHUB_USERNAME`
  - `DOCKERHUB_TOKEN`
  - `NPM_GH_TOKEN`
  - `PREMIUM_GHCR_USERNAME` (new)
  - `PREMIUM_GHCR_TOKEN` (new)

2. **Cloud image build and deploy handoff**
  - `PRIVATE_GITHUB_ACTIONS_DEKART_CLOUD`
  - `DEPLOY_REPO_TOKEN`

3. **E2E core and cloud/premium suites**
  - `GOOGLE_APPLICATION_CREDENTIALS`
  - `DEKART_MAPBOX_TOKEN`
  - `GOOGLE_OAUTH_CLIENT_ID`
  - `GOOGLE_OAUTH_SECRET`
  - `DEV_REFRESH_TOKEN`
  - `DEV_REFRESH_TOKEN_INFO` (used by current cloud E2E part 1)
  - `S3_BUCKET`
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
  - `SNOWFLAKE_ACCOUNT_ID`
  - `SNOWFLAKE_USER`
  - `SNOWFLAKE_PASSWORD`

4. **Documentation sync workflow (if kept)**
  - `DOCKERHUB_PASSWORD` (currently used by `dockerhub.yaml`; can be unified with token-based auth later)

