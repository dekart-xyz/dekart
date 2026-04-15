# Resumable File Upload Design (Frontend + Agent)

## Why this doc

Current file upload is a single `multipart/form-data` POST to Dekart:

- client: `src/client/actions/file.js` -> `POST /api/v1/file/{id}.csv`
- server: `src/server/dekart/file.go` -> `UploadFile`

This is limited by single-request size constraints and unstable for large files.
Today we enforce `DEKART_MAX_FILE_UPLOAD_SIZE` (default 32 MB) and reject above limit.

## Current state review

### What works

- Upload authorization and report/file ownership checks are centralized in `UploadFile`.
- Existing `CreateFile` + `files` table lifecycle is already in place (`file_status`, `upload_error`, `file_source_id`).
- Storage abstraction already supports multiple backends and per-connection context.

### Main bottleneck

- One request carries full file body (`r.FormFile("file")`), so large uploads fail by request-size limits.
- No resume support (network drop means restart from zero).
- Frontend and future agent would need separate custom logic unless we standardize now.

## Recommended solution

Use a Dekart-managed **Upload Session API** with chunk uploads sent to Dekart server (not browser direct-to-cloud).

## Decisions made so far

1. Protocol choice
- We will use Dekart Upload Session API (control plane), not Tus, for fastest delivery with current architecture.

2. Provider mapping
- S3-compatible storage: multipart objects staged by Dekart server, finalized by backend.
- GCS-compatible storage: chunk objects staged by Dekart server, finalized by backend compose.

3. Session persistence for phase 1
- `upload_session_id` state is stored in-memory inside Dekart process.
- This is acceptable for current single-instance deployment.
- Clients (frontend/agent) use `upload_session_id` only within the current upload flow.

4. Future persistence
- Move session store behind `UploadSessionStore` interface.
- Add Postgres-backed implementation later without API changes.

5. Transport decision
- Upload session endpoints will be JSON HTTP, not gRPC.
- Why:
  - browser and agent upload clients naturally work with HTTP upload semantics
  - session payloads include chunk metadata and completion manifest
  - existing file upload path is already HTTP (`/api/v1/file/{id}.csv`)
- gRPC remains the default for existing app data RPCs, but upload session control plane is HTTP JSON by design.
- Implementation note:
  - use existing Dekart proto<->JSON helpers (`readProtoJSON` / `writeProtoJSON`) in server handlers
  - define request/response messages in `proto/dekart.proto` and keep HTTP handlers thin

Key design goals:

- one upload protocol for web + agent
- provider-agnostic client behavior
- chunk payloads are bounded and always pass through Dekart app server
- keep existing file authorization model and `files` lifecycle

### Why this is the most elegant fit for Dekart

- Works with current dynamic connection model (bucket/credentials can differ per file/report).
- Keeps auth and permissions in Dekart control plane.
- Avoids building and operating a custom chunk store in app server.
- Lets each cloud backend use the upload mechanism it is best at:
  - S3: multipart upload
  - GCS: resumable upload session
- Keeps frontend and agent code independent from storage provider details.

## Proposed API (control plane)

All endpoints remain under Dekart auth.

1. `POST /api/v1/file/{id}/upload-sessions`
- validates file ownership + write permissions (same checks as current `UploadFile`)
- validates metadata (name, mime, total_size)
- creates upload session in session store (phase 1: in-memory)
- returns:
  - `upload_session_id`
  - normalized upload plan (provider-agnostic), for example:
    - `mode` (`chunked`)
    - `max_part_size` (strict upper bound, must be respected by client)
    - `upload_part_endpoint` (Dekart endpoint to request per-part upload target)
    - `required_headers` per part/chunk

2. `PUT /api/v1/file/{id}/upload-sessions/{session_id}/parts/{part_number}?part_size={bytes}`
- request body is raw chunk bytes (`application/octet-stream`)
- server validates `part_size <= max_part_size` and stores chunk in storage backend
- returns part manifest item:
  - `part_number`
  - `etag` (when backend provides it)
  - `size`

3. `POST /api/v1/file/{id}/upload-sessions/{session_id}/complete`
- accepts proof/manifest:
  - normalized manifest shape defined by Dekart contract
  - server maps this internally to provider-specific completion requirements
- finalizes provider upload
- updates `files` row:
  - `name`, `size`, `mime_type`, `file_source_id`, `file_status`
- emits report ping

4. `DELETE /api/v1/file/{id}/upload-sessions/{session_id}`
- abort/cleanup unfinished multipart upload

## Client behavior

### Frontend

- keep `CreateFile` flow as-is
- replace single XHR upload with session flow:
  - create session
  - upload parts/chunks to Dekart `/parts/{part_number}` with retry + backoff
  - call complete
- chunk size default:
  - 8-16 MB
  - configurable from server response

### Agent/CLI

- same exact session API
- upload from file stream in chunks
- keep one in-flight chunk upload per file/session
- no provider-specific branching in agent code

## Storage adapter approach

Add upload-session adapter methods near storage domain (provider-specific implementations):

- `StartUploadSession(...)`
- `UploadPart(...)`
- `CompleteUpload(...)`
- `AbortUpload(...)`

Notes:

- S3 path maps naturally to multipart APIs.
- GCS path maps naturally to resumable upload session URL.
- Keep this separate from current `GetWriter` path to avoid mixing single-stream and resumable logic.

## Backend behavior by provider

This section describes how Dekart backend should implement upload sessions for both storage types while keeping the client contract unified.

### Backend contract (same for all providers)

Backend always owns:

- authn/authz checks (`file_id` ownership, workspace permissions)
- upload session lifecycle (`created -> uploading -> completed|aborted|expired`)
- provider session translation (S3 upload IDs vs GCS resumable session URLs)
- final integrity gate before marking `files.file_status=done`

Client never needs to know provider internals.

### Common backend flow

1. `CreateFile` remains unchanged (allocates Dekart `file_id`).
2. `POST upload-sessions` does authorization and metadata validation, then initializes provider upload state.
3. Client requests part targets and uploads directly to cloud storage (data plane bypasses Dekart app server body limits).
4. `POST complete` finalizes provider upload, verifies object metadata, then updates Dekart `files` record.
5. `DELETE` aborts provider upload and marks session aborted.

### S3-compatible backend flow

- On session start:
  - initialize session metadata and parts prefix/object key
- On `parts/{part_number}`:
  - accept chunk bytes through Dekart HTTP endpoint
  - persist chunk to provider bucket as part object
  - return manifest item (`part_number`, `etag`, `size`)
- On complete:
  - compose/finalize part objects into final object
  - verify final size/content-type
- On abort:
  - delete staged part objects and mark session aborted

### GCS-compatible backend flow

- On session start:
  - initialize session metadata and parts prefix/object key
- On `parts/{part_number}`:
  - accept chunk bytes through Dekart HTTP endpoint
  - persist chunk to provider bucket as part object
  - return manifest item (`part_number`, `etag`, `size`)
- On complete:
  - compose part objects into final object
  - verify final object exists and expected size/content-type
  - finalize Dekart file record
- On abort:
  - delete staged part objects and mark session aborted

### Provider state kept in Dekart session (internal only)

- shared fields:
  - `session_id`, `file_id`, `status`, `expires_at`
  - declared `size`, `mime_type`, `name`
- S3/GCS-specific:
  - `bucket`, `object`, `parts_prefix`
  - received part manifest (`part_number`, `etag`, `size`)

### Completion semantics

- `complete` is idempotent:
  - if already completed, return final file metadata
  - if still uploading, attempt provider finalize once
- Dekart updates DB only after provider finalize succeeds:
  - `file_status = done`
  - `file_source_id = object key`
  - `size`/`mime_type` synced from verified metadata
- if finalize fails:
  - keep session in `uploading` or `failed`
  - return retriable error for transient provider failures

### Provider differences hidden from client

- Client always does:
  - create session
  - upload part to Dekart
  - complete
- Backend handles provider mapping internally:
  - provider-specific part object writes
  - provider-specific compose/finalize

## Session store (phase 1)

In-memory upload session state:

- `id` (uuid)
- `file_id`
- `provider`
- `status` (`created|uploading|completed|aborted|expired`)
- `provider_upload_id` / session URL reference (encrypted if needed)
- `metadata_json`
- `expires_at`, `created_at`, `updated_at`

Why:
- fastest path for single-instance deployment
- no migration needed to deliver frontend and agent flows

Caveats:
- sessions are lost on process restart
- interrupted uploads must be restarted
- not horizontally scalable

## DB additions (phase 2)

Add `file_upload_sessions` table with same shape as in-memory model.

## Backward compatibility and rollout

Phase 1

- add upload session endpoints
- store sessions in memory
- no public status/resume endpoint in v1
- keep current `/api/v1/file/{id}.csv` for small files

Phase 2

- move session store to Postgres
- add explicit status/resume endpoint
- frontend uses session flow for all files
- fallback to old path behind feature flag only

Phase 3

- remove old single-request path or keep only for tiny files (<5 MB)

## Security and reliability rules

- verify final size and mime against declared metadata
- enforce max file size on session creation
- session TTL + periodic cleanup job for stale uploads

## Nice-to-have after core delivery

- pause/resume UI (after status endpoint lands)
- upload concurrency tuning
- progress persisted across tab reload
- server-side antivirus hook for enterprise tier

## Frontend implementation plan (v1)

This section is the implementation checklist for migrating client upload from single `POST /api/v1/file/{id}.csv` to upload sessions.

### Scope

- Keep `CreateFile` gRPC flow unchanged.
- Replace file bytes upload path with new HTTP upload-session endpoints.
- Keep UX simple: one in-flight part upload per file/session.
- No resume across refresh in v1.

### Files to update

`src/client/actions/file.js`
- Replace old `uploadFile` XHR multipart logic with orchestrated upload-session flow.
- Add control-plane helper calls for:
  - `createFileUploadSession(fileId, fileInfo, token)`
  - `uploadPartViaDekart(fileId, uploadSessionId, partNumber, partSize, blob, token)`
  - `completeFileUploadSession(fileId, uploadSessionId, manifest, totalSize, token)`
  - `abortFileUploadSession(fileId, uploadSessionId, token)`
- Keep `createFile(datasetId, connectionId)` unchanged.
- Keep tracking events and add part/session events for reliability debugging.

`src/client/reducers/fileUploadReducer.js` (new)
- Move `fileUploadStatus` reducer out of `rootReducer.js` into dedicated module.
- Replace current `fileUploadStatus` shape (`readyState/status`) with session-state model:
  - `phase`: `idle|starting|uploading|completing|done|error|aborted`
  - `loaded`, `total`, `partNumber`, `partsTotal`
  - `uploadSessionId`
  - `error`
- Handle new upload actions (start/progress/phase/error/complete/reset).

`src/client/reducers/rootReducer.js`
- Remove inline `fileUploadStatus` reducer implementation.
- Import `fileUploadStatus` from `./fileUploadReducer` and wire it in `combineReducers`.

`src/client/File.jsx`
- Read new `fileUploadStatus` fields and render phase-based text.
- Show progress from `loaded/total` only (not XHR `readyState`).
- Keep size validation before start.
- On `Upload` click, call new session-based `uploadFile(file.id, fileToUpload)`.

`src/client/lib/api.js`
- Reuse existing host/token handling pattern.
- Add JSON helper for authenticated POST/DELETE to `/api/v1/*`:
  - `post(endpoint, body, token)`
  - `del(endpoint, token)`
- Keep existing `get()` behavior unchanged.

`src/client/lib/fileUpload.js` (new)
- New orchestrator module with non-UI logic:
  - `buildUploadParts(fileSize, maxPartSize)` -> deterministic part plan.
  - `sliceFilePart(file, offset, size)` -> `Blob`.
  - `uploadPartViaDekart(fileId, uploadSessionId, partNumber, partSize, blob, token)` -> uploads chunk to Dekart and returns manifest item.
  - `runFileUploadSession({ fileId, file, token, dispatch })` -> end-to-end flow (start -> parts -> complete).
- Include bounded retry/backoff for transient errors on:
  - part upload to Dekart
  - `completeFileUploadSession`

### Functions and action contract

`src/client/actions/file.js`
- Add actions:
  - `uploadFileStart(fileId, file)`
  - `uploadFilePhase(fileId, phase, payload = {})`
  - `uploadFileProgress(fileId, loaded, total, partNumber, partsTotal)`
  - `uploadFileError(fileId, error)`
  - `uploadFileDone(fileId, result)`
  - `uploadFileReset(fileId)`
- Keep exported thunk name `uploadFile(fileId, file)` so callers do not change.

`src/client/lib/fileUpload.js`
- Add:
  - `runFileUploadSession(...)` as the only orchestration entrypoint used by `uploadFile` thunk.
- Internal helper functions should stay pure where possible for unit testing.

### Error handling and UX rules

- If start fails: phase -> `error`, preserve message from server when available.
- If part upload fails repeatedly: call abort endpoint best-effort, then phase -> `error`.
- If complete fails with retriable error: retry with backoff, then fail to `error`.
- User retry action should start a fresh session (no resume in v1).

### Telemetry changes

- Keep existing:
  - `FileUploadStarted`
  - `FileUploadCompleted`
  - `FileUploadFailed`
- Add:
  - `FileUploadSessionStarted`
  - `FileUploadPartUploaded`
  - `FileUploadSessionCompleted`
  - `FileUploadSessionAborted`
- Include `fileId`, `uploadSessionId`, `partNumber`, `partSize`, and `status` where applicable.

### Tests to add

`src/client/lib/fileUpload.test.js` (new)
- `buildUploadParts` boundaries:
  - exact multiple of part size
  - last partial part
  - max-part-size enforcement
- retry logic for transient part failures
- manifest generation correctness (`part_number`, `etag`, `size`)

`src/client/actions/file.test.js` (new)
- thunk dispatch order for happy path and error path
- reducer state transitions for all upload phases (via `fileUploadReducer`)

### Rollout sequence

1. Add `fileUpload.js` + API JSON helpers.
2. Switch `uploadFile` thunk to session flow behind existing button.
3. Migrate reducer/state model and update `File.jsx` status rendering.
4. Remove old `POST /file/{id}.csv` client call.
5. Add tests and verify on `.env.bigquery` with file sizes above old single-request limit.
