# CI Build Speedup Options

This document lists practical options to radically reduce pull request CI time for the current workflow chain:

`flavour -> changes -> build_e2e -> e2e_tests (matrix) -> comment_results`

## Current Bottleneck (Observed)

- The critical path is effectively:
  - `build_e2e` image build and push
  - plus the slowest `e2e_tests` matrix shard
- This creates a floor around ~11-12 minutes even when jobs pass cleanly.
- Most end-to-end time is spent on image build/pull/setup rather than test logic itself.

## Highest-Impact Options

### 1) Split CI into Fast PR lane + Full Confidence lane

**What changes**
- Keep a small "required" PR lane (unit tests + smoke E2E only).
- Move full E2E matrix to:
  - nightly schedule
  - merge queue
  - or non-blocking PR check.

**Expected impact**
- Largest reduction in developer feedback time.
- Typical PRs complete in a few minutes rather than waiting for full matrix completion.

**Trade-offs**
- Full integration coverage shifts from "every PR is blocking" to "asynchronous/full-run cadence."

---

### 2) Affected-only E2E matrix selection

**What changes**
- Replace broad `e2e` filter trigger logic with path-to-suite mapping.
- Run only relevant matrix shards for changed areas.
- Keep full matrix for nightly or pre-release workflows.

**Expected impact**
- 2x to 5x speedups on most PRs that touch limited surface area.

**Trade-offs**
- Needs curated mapping ownership and periodic updates.
- Risk of missed coupling if mapping is incomplete.

---

### 3) Prebuilt base image + thin PR delta images

**What changes**
- Build heavyweight base layers on `main`/nightly.
- PR builds reuse base and only rebuild changed layers.
- Avoid always rebuilding everything from source for E2E.

**Expected impact**
- Major reduction in `build_e2e` wall time.
- Better cache hit rate and fewer cold builds.

**Trade-offs**
- Requires Dockerfile layering discipline and cache strategy maintenance.

---

### 4) Persistent runners with warm Docker cache

**What changes**
- Move build-heavy jobs from fully ephemeral hosted runners to persistent runners.
- Keep local BuildKit layer cache on runner disks.

**Expected impact**
- 40% to 70% reduction in build-heavy stages is common.

**Trade-offs**
- Runner ops overhead, security hardening, and capacity planning.

## Medium-Impact Options

### 5) Parallelize cloud E2E parts

**What changes**
- `e2e-cloud` currently runs two parts sequentially.
- Split into two jobs or a matrix over `cloudBasicFlowStart` / `cloudBasicFlowEnd`.

**Expected impact**
- 30% to 50% reduction for cloud lane duration.

**Trade-offs**
- Slightly more workflow complexity and artifact naming conventions.

---

### 6) Remove unnecessary emulation/setup in test workflows

**What changes**
- In `go_test.yaml` and `node_test.yaml`, remove QEMU/buildx setup if only `linux/amd64` execution is required.

**Expected impact**
- Small to moderate per-job improvement.

**Trade-offs**
- Must reintroduce if multi-arch builds are needed there.

---

### 7) Add PR concurrency cancellation

**What changes**
- Add `concurrency` keys so older runs on same PR branch are canceled when new commits are pushed.

**Expected impact**
- No single-run speedup, but large reduction in wasted CI minutes and queue contention.

**Trade-offs**
- Earlier run logs can disappear quickly unless artifacts are uploaded promptly.

## Strategic Redesign Options

### 8) Build once, test many

**What changes**
- Build immutable image artifacts once per commit SHA.
- Reuse the same artifact in all test workflows and reruns.
- Prefer SHA-based tags for reuse, not run-specific tags.

**Expected impact**
- Eliminates repeated build work across retries and split workflows.

**Trade-offs**
- Requires clearer artifact lifecycle, retention, and cleanup policy.

---

### 9) Run unit tests natively (non-Docker)

**What changes**
- Run Go and Node unit tests directly with dependency caching instead of via Docker build targets.

**Expected impact**
- Faster startup and better cache locality for pure unit test feedback.

**Trade-offs**
- Slightly less parity with containerized runtime.

## Recommended Rollout (Low Risk -> High Impact)

### Phase 1 (quick wins, low risk)

1. Add PR concurrency cancellation.
2. Remove unnecessary QEMU/buildx from non-multi-arch test workflows.
3. Parallelize cloud E2E parts.

### Phase 2 (high impact)

1. Introduce fast required PR lane + nightly full matrix.
2. Implement affected-only E2E suite selection.

### Phase 3 (infrastructure optimization)

1. Introduce prebuilt base image strategy.
2. Evaluate persistent runners with warm cache.

## Decision Matrix

| Option | Impact | Effort | Operational Risk |
|---|---|---|---|
| Fast PR lane + full nightly lane | Very High | Medium | Low-Medium |
| Affected-only E2E shards | Very High | Medium | Medium |
| Prebuilt base + PR delta images | High | Medium-High | Medium |
| Persistent runners + warm cache | High | High | Medium-High |
| Parallelize cloud E2E parts | Medium | Low | Low |
| Remove unneeded emulation setup | Medium | Low | Low |
| PR concurrency cancellation | Medium | Low | Low |
| Build once, test many (SHA artifact reuse) | High | Medium | Medium |
| Native unit tests with caching | Medium-High | Medium | Low-Medium |

## Suggested Success Metrics

- Median PR time to first required-check result.
- P95 PR time to green.
- Build stage duration (`build_e2e`) over time.
- Cache hit ratio for build layers.
- CI minutes consumed per merged PR.
