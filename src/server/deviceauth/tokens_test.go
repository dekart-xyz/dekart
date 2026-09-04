package deviceauth

import (
	"context"
	"database/sql"
	"testing"
)

func TestGetTokenUpdateAdvancesWhenTimestampsTie(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("sql.Open: %v", err)
	}
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE device_auth_log (
		device_id TEXT NOT NULL,
		workspace_id TEXT,
		email TEXT,
		created_at DATETIME NOT NULL
	)`); err != nil {
		t.Fatalf("create fixture: %v", err)
	}

	insert := `INSERT INTO device_auth_log VALUES (?, 'workspace-1', 'user@example.com', '2026-09-04 12:00:00')`
	if _, err := db.Exec(insert, "device-1"); err != nil {
		t.Fatalf("insert first row: %v", err)
	}
	first, err := GetTokenUpdate(context.Background(), db, "workspace-1", "user@example.com")
	if err != nil {
		t.Fatalf("first GetTokenUpdate: %v", err)
	}
	if _, err := db.Exec(insert, "device-2"); err != nil {
		t.Fatalf("insert second row: %v", err)
	}
	second, err := GetTokenUpdate(context.Background(), db, "workspace-1", "user@example.com")
	if err != nil {
		t.Fatalf("second GetTokenUpdate: %v", err)
	}
	if first != 1 || second != 2 {
		t.Fatalf("expected monotonic markers 1 and 2, got %d and %d", first, second)
	}
}

func TestListWorkspaceTokensExcludesExpiredAuthorization(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("sql.Open: %v", err)
	}
	defer db.Close()
	if _, err := db.Exec(`
		CREATE TABLE device_auth_log (
			device_id TEXT NOT NULL,
			device_name TEXT,
			status TEXT NOT NULL,
			workspace_id TEXT,
			email TEXT,
			expires_at DATETIME NOT NULL,
			created_at DATETIME NOT NULL
		);
		INSERT INTO device_auth_log VALUES
			('expired-device', 'Old laptop', 'authorized', 'workspace-1', 'user@example.com', '2020-01-01', '2026-09-04 12:00:00'),
			('active-device', 'Current laptop', 'consumed', 'workspace-1', 'user@example.com', '2020-01-01', '2026-09-04 12:00:01');
	`); err != nil {
		t.Fatalf("create fixture: %v", err)
	}

	tokens, err := ListWorkspaceTokens(context.Background(), db, "workspace-1", "user@example.com")
	if err != nil {
		t.Fatalf("ListWorkspaceTokens: %v", err)
	}
	if len(tokens) != 1 || tokens[0].ID != "active-device" {
		t.Fatalf("unexpected tokens: %#v", tokens)
	}
}
