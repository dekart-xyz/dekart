package dekart

import (
	"context"
	"database/sql"
)

// compactReportHistoryTx thins old history for one report without deleting its current version.
func (s Server) compactReportHistoryTx(ctx context.Context, tx *sql.Tx, reportID string) error {
	args := []any{reportID}
	discarded := `WITH ranked AS (
    SELECT version_id,
           row_number() OVER (
               PARTITION BY report_id, author_email, date_trunc('hour', created_at)
               ORDER BY created_at DESC, version_id DESC
           ) AS rn
    FROM report_snapshots
    WHERE report_id = $1 AND created_at < now() - interval '24 hours'
), discarded AS (
    SELECT version_id FROM ranked
    WHERE rn > 1
      AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.version_id = ranked.version_id)
)`
	// SQLite has second-resolution timestamps, so insert order resolves ties.
	if IsSqlite() {
		// Freeze the cutoff across child and parent deletes; SQLite's now changes per statement.
		var cutoff string
		if err := tx.QueryRowContext(ctx, `SELECT datetime('now', '-24 hours')`).Scan(&cutoff); err != nil {
			return err
		}
		args = append(args, cutoff)
		discarded = `WITH ranked AS (
    SELECT version_id,
           row_number() OVER (
               PARTITION BY report_id, author_email, strftime('%Y-%m-%d %H', created_at)
               ORDER BY created_at DESC, rowid DESC
           ) AS rn
    FROM report_snapshots
    WHERE report_id = $1 AND created_at < $2
), discarded AS (
    SELECT version_id FROM ranked
    WHERE rn > 1
      AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.version_id = ranked.version_id)
)`
	}
	// SQLite does not enable foreign keys; delete children before their parent on both engines.
	for _, target := range []struct{ table, column string }{
		{"query_snapshots", "report_version_id"},
		{"dataset_snapshots", "report_version_id"},
		{"report_snapshots", "version_id"},
	} {
		_, err := tx.ExecContext(ctx, discarded+" DELETE FROM "+target.table+
			" WHERE "+target.column+" IN (SELECT version_id FROM discarded)", args...)
		if err != nil {
			return err
		}
	}
	return nil
}
