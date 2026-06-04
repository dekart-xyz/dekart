# Report Visit Events Implementation Plan

## Goal

Add report visit time-series data so self-hosted customers can answer:

- visits per report per day/week/month;
- unique active users who visited reports per period;
- who visited which report and when.

This addresses the current gap where `report_analytics` stores one aggregate row per `report_id` and `email`, with `num_views` and a single `updated_at`, so historical visit timestamps are lost.

## Product Decision

Default implementation:

- Keep `report_analytics` as the fast aggregate table for existing viewer analytics counters.
- Add a dedicated immutable per-visit event log table.
- Record one event at the same point Dekart currently increments `report_analytics.num_views`.
- Preserve the existing `track_viewers` toggle as the only user-facing consent/control for this tracking path.

Open customer-facing decision:

- Phase 1 should support direct Postgres/SQLite reads from the event table.
- Add an endpoint only if customers prefer API access over database reads. If added, make it explicit, for example `/api/v1/report/{report}/visits.csv`, instead of changing the current aggregate CSV semantics silently.

## Current State

Relevant files:

- `src/server/dekart/stream.go`
  - `sendReportMessage` updates `report_analytics` when `report.TrackViewers` is true.
  - Current SQL upserts by `(report_id, email)` and increments `num_views`.
- `src/server/dekart/analytics.go`
  - `getReportAnalytics` counts unique `report_analytics` rows for all-time, 7-day, and 24-hour viewers.
  - `ServeReportAnalytics` exports one row per user/report from `report_analytics`.
- `migrations/000030_report_analytics.up.sql`
- `sqlite/migrations/000030_report_analytics.up.sql`
  - `report_analytics` schema has `report_id`, `email`, `num_views`, `created_at`, `updated_at`, and a unique `(report_id, email)` constraint.
- `migrations/000035_add_missing_indexes.up.sql`
- `sqlite/migrations/000035_add_missing_indexes.up.sql`
  - Existing index only covers `report_analytics(report_id)`.
- `proto/dekart.proto`
  - `ReportAnalytics` currently exposes only summary counters.

Implication:

- `updated_at` can answer "last seen in period", not "visits in period".
- `num_views` can answer all-time total per user/report only if summed, but cannot be bucketed by time.

## Scope

In scope:

- Database schema for immutable report visit events in both Postgres and SQLite migrations.
- Backend write path that logs one visit event whenever the current aggregate counter is updated.
- Small backend helper around report analytics writes so aggregate and event writes stay together.
- Query examples for direct database reads.
- Tests for the write path.

Out of scope:

- New analytics charts in the Dekart UI.
- New visit-events endpoint or CSV export. Add it later only if customers prefer endpoint access over database reads.
- Retroactive reconstruction of historical per-visit data from existing `report_analytics`.
- Anonymous public report analytics when no authenticated user is present.
- New environment variables.
- Additional customer billing or plan gates beyond existing analytics access checks.

## Data Model

Add a new table named `report_visit_events`.

Postgres migration:

```sql
CREATE TABLE IF NOT EXISTS report_visit_events (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id uuid NOT NULL,
    email varchar(255) NOT NULL,
    created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_report_visit_events_report_created_at
    ON report_visit_events (report_id, created_at);

CREATE INDEX IF NOT EXISTS idx_report_visit_events_email_created_at
    ON report_visit_events (email, created_at);
```

SQLite migration:

```sql
CREATE TABLE IF NOT EXISTS report_visit_events (
    id TEXT NOT NULL PRIMARY KEY DEFAULT (
        lower(hex(randomblob(4))) || '-' ||
        lower(hex(randomblob(2))) || '-' ||
        lower(hex(randomblob(2))) || '-' ||
        lower(hex(randomblob(2))) || '-' ||
        lower(hex(randomblob(6)))
    ),
    report_id TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_report_visit_events_report_created_at
    ON report_visit_events (report_id, created_at);

CREATE INDEX IF NOT EXISTS idx_report_visit_events_email_created_at
    ON report_visit_events (email, created_at);
```

Notes:

- Do not add uniqueness constraints. Multiple visits by the same user to the same report are the point of the table.
- Use `created_at` as the event timestamp. No `updated_at` is needed for immutable events.
- Use `ON DELETE CASCADE` so deleting a report removes its visit history with the report.
- Keep email because existing analytics already stores email and the customer request asks "who visited".

## Backend Write Path

Server file:

- `src/server/dekart/stream.go`

Event definition:

- Phase 1 defines a visit event as the same server-side analytics event that currently increments `report_analytics.num_views`.
- This is intentionally not a stricter browser page-load definition. `GetReportStream` can send after stream updates or reconnects, so the new event table will preserve today's counting semantics with timestamps.
- If product later needs "one human page open" semantics, move tracking to an explicit page-open boundary and update both the aggregate and event writes together.

Recommended change:

1. Extract the current `report_analytics` upsert into a small helper, for example `trackReportVisit(ctx, reportID, email) error`.
2. Inside the helper, write both:
   - insert one row into `report_visit_events`;
   - upsert `report_analytics` exactly as today.
3. Call the helper only when `report.TrackViewers` is true.
4. Keep errors fail-closed for consistency with the current implementation: if analytics cannot be recorded, return the same `Cannot insert report analytics` style gRPC error and do not silently continue.

Transaction decision:

- Prefer one DB transaction for the event insert plus aggregate upsert so the event log and aggregate counter do not diverge.
- If the first implementation avoids a transaction, document that aggregate/event counts may drift on partial failure and add retry-safe behavior later. The transaction is small and should be the default.

## Analytics Summary Behavior

Keep existing `GetReportAnalytics` summary counters compatible:

- `viewers_total`, `viewers_7d`, and `viewers_24h` should continue to represent unique viewers, not total visits.
- Continue deriving those counters from `report_analytics` unless product wants "active users by event timestamp" to replace "last seen in window".

Recommended follow-up after event logging ships:

- Consider changing period-based unique viewer counters to count distinct emails in `report_visit_events` by event timestamp. That better matches "active users per period" but subtly changes current UI semantics from "users last seen in period" to "users who visited during period".
- If changed, update `AnalyticsModal` labels/tests so the UI meaning is explicit.

## Read Access Options

### Phase 1: Database Reads Only

Ship only the table and document example queries.

Postgres example queries:

```sql
-- visits per report per month
SELECT report_id, date_trunc('month', created_at) AS month, count(*) AS visits
FROM report_visit_events
GROUP BY report_id, month
ORDER BY month, report_id;

-- unique active users per report per month
SELECT report_id, date_trunc('month', created_at) AS month, count(DISTINCT email) AS users
FROM report_visit_events
GROUP BY report_id, month
ORDER BY month, report_id;

-- who visited which report and when
SELECT report_id, email, created_at
FROM report_visit_events
ORDER BY created_at DESC;
```

SQLite example queries:

```sql
-- visits per report per month
SELECT report_id, strftime('%Y-%m', created_at) AS month, count(*) AS visits
FROM report_visit_events
GROUP BY report_id, month
ORDER BY month, report_id;

-- unique active users per report per month
SELECT report_id, strftime('%Y-%m', created_at) AS month, count(DISTINCT email) AS users
FROM report_visit_events
GROUP BY report_id, month
ORDER BY month, report_id;

-- who visited which report and when
SELECT report_id, email, created_at
FROM report_visit_events
ORDER BY created_at DESC;
```

Pros:

- Smallest product/API surface.
- Directly matches the customer's internal dashboard use case.
- Avoids adding a public contract before customer preference is clear.

Cons:

- Customers couple dashboards to the internal metadata schema.
- No permissioned HTTP access for deployments where DB reads are inconvenient.

### Follow-Up Option: Add CSV Endpoint

Add a new endpoint:

- `GET /api/v1/report/{report}/visits.csv`

Server files:

- `src/server/app/app.go`
- `src/server/dekart/analytics.go`

Behavior:

- Same auth, plan, report existence, and `CanWrite` checks as `ServeReportAnalytics`.
- Return `report_id,email,created_at`.
- Read from `report_visit_events`.
- Use `created_at DESC` or `created_at ASC` consistently. Prefer `DESC` for inspection, `ASC` for time-series export; choose one and document it.

Do not repurpose `/report/{report}/analytics.csv` in Phase 1. Existing users may already depend on its aggregate row shape.

## Proto/API Contract

No proto changes are required for Phase 1 if the read path is database-only or CSV-only.

Add proto messages only if a typed client API is explicitly needed, for example:

- `GetReportVisitEventsRequest`
- `GetReportVisitEventsResponse`
- `ReportVisitEvent`

Per `agents.md`, proto is the source of truth for gRPC contracts and generated files must be regenerated with `make proto`.

## Implementation Steps

1. Add Postgres and SQLite migrations for `report_visit_events`.
2. Add `trackReportVisit(ctx, reportID, email)` in `src/server/dekart`.
3. Update `sendReportMessage` to call the helper when `report.TrackViewers` is true.
4. Keep the existing `report_analytics` aggregate behavior unchanged.
5. Document direct DB read examples for Postgres and SQLite.
6. Add tests for the Phase 1 write behavior.
7. Run focused backend and migration checks.

## Test Plan

Backend tests:

- Tracking disabled:
  - opening a report stream does not insert into `report_visit_events`;
  - existing `report_analytics` behavior remains unchanged.
- Tracking enabled:
  - first visit inserts one `report_visit_events` row and one aggregate row;
  - second visit by the same user inserts a second event row and increments `report_analytics.num_views`;
  - visit by another user inserts a distinct event row and aggregate row.
- Transaction/failure behavior:
  - event insert and aggregate upsert succeed or fail together where practical.
- Counting semantics:
  - verify the event row is recorded at the same point `report_analytics.num_views` increments;
  - do not claim browser page-load deduplication unless the implementation moves tracking to an explicit page-open boundary.

Suggested commands:

```sh
go test ./src/server/dekart -run 'ReportAnalytics|ReportVisit|Track'
go test ./src/server/user -run Claims
```

Migration checks:

- SQLite: start the server once with the local SQLite configuration, for example the repo's `.env.local` path, and verify `sqlite/migrations` apply cleanly to a fresh local database.
- Postgres: start the server once with the Postgres metadata configuration used by local/CI, for example `.env.pg`, and verify `migrations` apply cleanly to a fresh database.
- If a clean Postgres service is not available locally, document that and at least verify the SQL syntax against the migration runner path before opening implementation review.

## Risks

- Event volume can grow much faster than `report_analytics`.
  - Mitigation: add composite indexes for report/time and email/time; do not add extra denormalized columns until there is a real query need.
- Existing analytics UI period counters may not match the new customer definition of "active users per period".
  - Mitigation: keep summary counters unchanged in Phase 1, then explicitly decide whether to move period counters to event timestamps.
- Public report behavior depends on auth and tracking.
  - Mitigation: reuse the existing `track_viewers` gate and current authenticated stream path; do not add anonymous visitor tracking in this plan.
- CSV export could become large.
  - Mitigation: prefer database reads for dashboards in Phase 1, or add date filters before making a visit-events endpoint broadly used.

## Rollout

1. Ship event logging behind the existing `track_viewers` report setting.
2. Tell the customer that new visits are available from the deployment metadata database from the release forward.
3. Share example SQL for monthly visits and unique active users.
4. Ask whether they still need an endpoint after they test direct reads.
5. If needed, add the explicit visits CSV endpoint as a small follow-up.
