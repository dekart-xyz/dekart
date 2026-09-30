-- Keep all history for 24 hours, then the latest per report, author, and hour.
-- Always preserve the current version; explicitly delete children on both engines.
-- The migration driver supplies the transaction.

WITH ranked AS (
    SELECT version_id,
           row_number() OVER (
               PARTITION BY report_id, author_email, date_trunc('hour', created_at)
               ORDER BY created_at DESC, version_id DESC
           ) AS rn
    FROM report_snapshots
    WHERE created_at < now() - interval '24 hours'
), discarded AS (
    SELECT version_id FROM ranked
    WHERE rn > 1
      AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.version_id = ranked.version_id)
)
DELETE FROM query_snapshots
WHERE report_version_id IN (SELECT version_id FROM discarded);

WITH ranked AS (
    SELECT version_id,
           row_number() OVER (
               PARTITION BY report_id, author_email, date_trunc('hour', created_at)
               ORDER BY created_at DESC, version_id DESC
           ) AS rn
    FROM report_snapshots
    WHERE created_at < now() - interval '24 hours'
), discarded AS (
    SELECT version_id FROM ranked
    WHERE rn > 1
      AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.version_id = ranked.version_id)
)
DELETE FROM dataset_snapshots
WHERE report_version_id IN (SELECT version_id FROM discarded);

WITH ranked AS (
    SELECT version_id,
           row_number() OVER (
               PARTITION BY report_id, author_email, date_trunc('hour', created_at)
               ORDER BY created_at DESC, version_id DESC
           ) AS rn
    FROM report_snapshots
    WHERE created_at < now() - interval '24 hours'
), discarded AS (
    SELECT version_id FROM ranked
    WHERE rn > 1
      AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.version_id = ranked.version_id)
)
DELETE FROM report_snapshots
WHERE version_id IN (SELECT version_id FROM discarded);
