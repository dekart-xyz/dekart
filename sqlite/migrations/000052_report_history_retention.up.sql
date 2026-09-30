-- Keep all history for 24 hours, then the latest per report, author, and hour.
-- The driver supplies the transaction. Freeze the delete set because SQLite's now
-- changes per statement and foreign keys are disabled at startup.
CREATE TEMP TABLE report_history_discarded AS
WITH ranked AS (
    SELECT version_id,
           row_number() OVER (
               PARTITION BY report_id, author_email, strftime('%Y-%m-%d %H', created_at)
               ORDER BY created_at DESC, rowid DESC
           ) AS rn
    FROM report_snapshots
    WHERE created_at < datetime('now', '-24 hours')
)
SELECT version_id FROM ranked
WHERE rn > 1
  AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.version_id = ranked.version_id);

DELETE FROM query_snapshots
WHERE report_version_id IN (SELECT version_id FROM report_history_discarded);
DELETE FROM dataset_snapshots
WHERE report_version_id IN (SELECT version_id FROM report_history_discarded);
DELETE FROM report_snapshots
WHERE version_id IN (SELECT version_id FROM report_history_discarded);

DROP TABLE report_history_discarded;
