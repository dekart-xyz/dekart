package dekart

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	_ "github.com/mattn/go-sqlite3"
	"github.com/stretchr/testify/require"
)

func TestTrackedReportVisitsKeepEventHistoryAndAggregateCounter(t *testing.T) {
	db := newReportVisitTestDB(t, true)
	server := Server{db: db}
	reportID := "00000000-0000-0000-0000-000000000001"
	email := "viewer@example.com"

	require.NoError(t, server.trackReportVisit(context.Background(), reportID, email))
	require.NoError(t, server.trackReportVisit(context.Background(), reportID, email))

	var eventCount int
	err := db.QueryRow(`SELECT count(*) FROM report_visit_events WHERE report_id = ? AND email = ?`, reportID, email).Scan(&eventCount)
	require.NoError(t, err)
	require.Equal(t, 2, eventCount)

	var aggregateCount int
	var views int
	err = db.QueryRow(`SELECT count(*), num_views FROM report_analytics WHERE report_id = ? AND email = ?`, reportID, email).Scan(&aggregateCount, &views)
	require.NoError(t, err)
	require.Equal(t, 1, aggregateCount)
	require.Equal(t, 2, views)
}

func TestTrackedReportVisitDoesNotLeaveEventWithoutAggregateCounter(t *testing.T) {
	db := newReportVisitTestDB(t, false)
	server := Server{db: db}
	reportID := "00000000-0000-0000-0000-000000000001"
	email := "viewer@example.com"

	err := server.trackReportVisit(context.Background(), reportID, email)
	require.Error(t, err)

	var eventCount int
	err = db.QueryRow(`SELECT count(*) FROM report_visit_events WHERE report_id = ? AND email = ?`, reportID, email).Scan(&eventCount)
	require.NoError(t, err)
	require.Equal(t, 0, eventCount)
}

func newReportVisitTestDB(t *testing.T, includeAggregateTable bool) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite3", ":memory:")
	require.NoError(t, err)
	t.Cleanup(func() { db.Close() })

	execMigration(t, db, "sqlite/migrations/000048_report_visit_events.up.sql")

	if includeAggregateTable {
		execMigration(t, db, "sqlite/migrations/000030_report_analytics.up.sql")
	}

	return db
}

func execMigration(t *testing.T, db *sql.DB, path string) {
	t.Helper()

	sqlBytes, err := os.ReadFile(filepath.Join("..", "..", "..", path))
	require.NoError(t, err)

	_, err = db.Exec(string(sqlBytes))
	require.NoError(t, err)
}
