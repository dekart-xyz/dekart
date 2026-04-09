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

Use a Dekart-managed **Upload Session API** with provider-native multipart/resumable upload under the hood.

## Decisions made so far

1. Protocol choice
- We will use Dekart Upload Session API (control plane), not Tus, for fastest delivery with current architecture.

2. Provider mapping
- S3-compatible storage: S3 Multipart Upload.
- GCS-compatible storage: GCS Resumable Upload.

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
  - session payloads include provider-specific upload targets (presigned URLs, resumable session URLs, part manifests)
  - existing file upload path is already HTTP (`/api/v1/file/{id}.csv`)
- gRPC remains the default for existing app data RPCs, but upload session control plane is HTTP JSON by design.
- Implementation note:
  - use existing Dekart proto<->JSON helpers (`readProtoJSON` / `writeProtoJSON`) in server handlers
  - define request/response messages in `proto/dekart.proto` and keep HTTP handlers thin

Key design goals:

- one upload protocol for web + agent
- provider-agnostic client behavior
- no long file payload through Dekart app server
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
    - `part_size`
    - `ordering_mode` (`strict_sequential`)
    - `upload_part_endpoint` (Dekart endpoint to request per-part upload target)
    - `required_headers` per part/chunk
    - whether final manifest is required
  - optional server debug info (provider type) can be returned for logs, but client logic must not branch on provider type

2. `POST /api/v1/file/{id}/upload-sessions/{session_id}/parts/{part_number}`
- returns upload target for the specific part/chunk:
  - target URL
  - HTTP method
  - required headers
  - part/chunk size expectations
- sequencing contract:
  - server validates `part_number` equals expected next part
  - if out of order, return `409 Conflict` with `expected_part_number`
- why:
  - avoids pre-signing thousands of URLs up front
  - keeps signed URLs short-lived

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
  - upload parts/chunks with retry + backoff using normalized upload plan
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
- `UploadPart(...)` or signed part generation
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
  - call `CreateMultipartUpload`
  - store `upload_id` in upload session state
- On `parts/{part_number}`:
  - validate requested `part_number` matches session `next_part_number`
  - if mismatch, return `409 Conflict` + `expected_part_number`
  - generate presigned `UploadPart` URL for (`bucket`, `key`, `upload_id`, `part_number`)
  - return required headers and expected part size bounds
  - update session `next_part_number` only after part upload is confirmed
- On complete:
  - accept normalized manifest with `{part_number, etag}`
  - call `CompleteMultipartUpload`
  - optionally `HeadObject` verify final size/content-type
- On abort:
  - call `AbortMultipartUpload`
  - mark session `aborted`

### GCS-compatible backend flow

- On session start:
  - create GCS resumable upload session (session URL)
  - store resumable session reference in upload session state
- On `parts/{part_number}`:
  - validate requested `part_number` matches session `next_part_number`
  - if mismatch, return `409 Conflict` + `expected_part_number`
  - return upload target and `Content-Range`/chunk instructions for that part
  - for GCS this maps to sequential resumable chunks (single resumable session)
  - update session `next_part_number` only after chunk is confirmed uploaded
- On complete:
  - issue final resumable request for last chunk (if needed)
  - verify final object exists and expected size/content-type
  - finalize Dekart file record
- On abort:
  - mark session aborted in Dekart and stop issuing further part targets
  - if provider abort primitive is unavailable, rely on object lifecycle cleanup for orphaned partial uploads

### Provider state kept in Dekart session (internal only)

- shared fields:
  - `session_id`, `file_id`, `status`, `expires_at`
  - declared `size`, `mime_type`, `name`
- S3-specific:
  - `bucket`, `key`, `upload_id`
  - received part manifest (`part_number`, `etag`)
- GCS-specific:
  - `bucket`, `object`
  - resumable session reference and uploaded byte offset

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
  - request per-part target
  - upload part
  - complete
- Backend handles provider mapping internally:
  - S3 `UploadId` + ETag manifest
  - GCS resumable session + chunk ranges
- Response always uses the same ordering contract:
  - `ordering_mode=strict_sequential`
  - out-of-order requests are rejected with `409`

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

- signed URLs must be short-lived and scoped to single object/session
- verify final size and mime against declared metadata
- enforce max file size on session creation
- enforce checksum (per-part or final hash) where provider allows
- session TTL + periodic cleanup job for stale uploads

## Nice-to-have after core delivery

- pause/resume UI (after status endpoint lands)
- upload concurrency tuning
- progress persisted across tab reload
- server-side antivirus hook for enterprise tier
