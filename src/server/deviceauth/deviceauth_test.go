package deviceauth

import (
	"context"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

type stubTokenIssuer struct {
	token     string
	expiresAt time.Time
	err       error
}

// Issue returns fixed token payload for deterministic service tests.
func (s stubTokenIssuer) Issue(string, string) (string, time.Time, error) {
	return s.token, s.expiresAt, s.err
}

func TestPollTokenAuthorizedIssuesTokenAndConsumesSession(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "")
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	issuer := stubTokenIssuer{
		token:     "cli.jwt.token",
		expiresAt: time.Now().UTC().Add(24 * time.Hour),
	}
	deviceID := "dev-auth-ok"
	now := time.Now().UTC()

	mock.ExpectQuery(regexp.QuoteMeta(`SELECT status, expires_at, COALESCE(email, ''), COALESCE(workspace_id, ''), COALESCE(device_name, '')
		 FROM device_auth_log
		 WHERE device_id = $1
		 ORDER BY created_at DESC
		 LIMIT 1`)).
		WithArgs(deviceID).
		WillReturnRows(
			sqlmock.NewRows([]string{"status", "expires_at", "email", "workspace_id", "device_name"}).
				AddRow(SessionStatusAuthorized, now.Add(2*time.Minute), "user@example.com", "workspace-1", "Vladi MacBook"),
		)
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(`INSERT INTO device_auth_log (id, device_id, device_name, status, email, workspace_id, expires_at)
		 SELECT $2, device_id, device_name, $3, email, workspace_id, expires_at
		 FROM device_auth_log
		 WHERE id = (
		   SELECT id
		   FROM device_auth_log
		   WHERE device_id = $1
		   ORDER BY created_at DESC
		   LIMIT 1
		 )
		   AND status = $4
		 RETURNING COALESCE(email, ''), COALESCE(workspace_id, '')`)).
		WithArgs(deviceID, sqlmock.AnyArg(), SessionStatusConsumed, SessionStatusAuthorized).
		WillReturnRows(sqlmock.NewRows([]string{"email", "workspace_id"}).AddRow("user@example.com", "workspace-1"))
	mock.ExpectCommit()

	result, err := pollToken(context.Background(), db, issuer, deviceID)
	if err != nil {
		t.Fatalf("PollToken: %v", err)
	}
	if result.Status != SessionStatusAuthorized {
		t.Fatalf("unexpected status: %s", result.Status)
	}
	if result.Token != issuer.token {
		t.Fatalf("unexpected token: %q", result.Token)
	}
	if result.Email != "user@example.com" {
		t.Fatalf("unexpected email: %q", result.Email)
	}
	if result.WorkspaceID != "workspace-1" {
		t.Fatalf("unexpected workspace: %q", result.WorkspaceID)
	}
	if result.ExpiresIn <= 0 {
		t.Fatalf("expected positive expires_in, got: %d", result.ExpiresIn)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet: %v", err)
	}
}

func TestPollTokenAuthorizedAlreadyConsumedReturnsExpired(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "")
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	issuer := stubTokenIssuer{
		token:     "should-not-be-used",
		expiresAt: time.Now().UTC().Add(24 * time.Hour),
	}
	deviceID := "dev-auth-consumed"
	now := time.Now().UTC()

	mock.ExpectQuery(regexp.QuoteMeta(`SELECT status, expires_at, COALESCE(email, ''), COALESCE(workspace_id, ''), COALESCE(device_name, '')
		 FROM device_auth_log
		 WHERE device_id = $1
		 ORDER BY created_at DESC
		 LIMIT 1`)).
		WithArgs(deviceID).
		WillReturnRows(
			sqlmock.NewRows([]string{"status", "expires_at", "email", "workspace_id", "device_name"}).
				AddRow(SessionStatusAuthorized, now.Add(2*time.Minute), "user@example.com", "workspace-1", "Vladi MacBook"),
		)
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(`INSERT INTO device_auth_log (id, device_id, device_name, status, email, workspace_id, expires_at)
		 SELECT $2, device_id, device_name, $3, email, workspace_id, expires_at
		 FROM device_auth_log
		 WHERE id = (
		   SELECT id
		   FROM device_auth_log
		   WHERE device_id = $1
		   ORDER BY created_at DESC
		   LIMIT 1
		 )
		   AND status = $4
		 RETURNING COALESCE(email, ''), COALESCE(workspace_id, '')`)).
		WithArgs(deviceID, sqlmock.AnyArg(), SessionStatusConsumed, SessionStatusAuthorized).
		WillReturnRows(sqlmock.NewRows([]string{"email", "workspace_id"}))
	mock.ExpectRollback()

	result, err := pollToken(context.Background(), db, issuer, deviceID)
	if err != nil {
		t.Fatalf("PollToken: %v", err)
	}
	if result.Status != SessionStatusExpired {
		t.Fatalf("unexpected status: %s", result.Status)
	}
	if result.Error != "expired" {
		t.Fatalf("unexpected error: %q", result.Error)
	}
	if result.Token != "" {
		t.Fatalf("expected no token, got: %q", result.Token)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet: %v", err)
	}
}

func TestPollTokenPendingExpiredMarksSessionExpired(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "")
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	issuer := stubTokenIssuer{token: "unused", expiresAt: time.Now().UTC().Add(time.Hour)}
	deviceID := "dev-expired"
	now := time.Now().UTC()

	mock.ExpectQuery(regexp.QuoteMeta(`SELECT status, expires_at, COALESCE(email, ''), COALESCE(workspace_id, ''), COALESCE(device_name, '')
		 FROM device_auth_log
		 WHERE device_id = $1
		 ORDER BY created_at DESC
		 LIMIT 1`)).
		WithArgs(deviceID).
		WillReturnRows(
			sqlmock.NewRows([]string{"status", "expires_at", "email", "workspace_id", "device_name"}).
				AddRow(SessionStatusPending, now.Add(-2*time.Minute), "", "", "test-device"),
		)
	mock.ExpectExec(regexp.QuoteMeta(`INSERT INTO device_auth_log (id, device_id, device_name, status, email, workspace_id, expires_at)
		 SELECT $2, device_id, device_name, $3, email, workspace_id, expires_at
		 FROM device_auth_log
		 WHERE id = (
		   SELECT id
		   FROM device_auth_log
		   WHERE device_id = $1
		   ORDER BY created_at DESC
		   LIMIT 1
		 )
		   AND status = $4`)).
		WithArgs(deviceID, sqlmock.AnyArg(), SessionStatusExpired, SessionStatusPending).
		WillReturnResult(sqlmock.NewResult(0, 1))

	result, err := pollToken(context.Background(), db, issuer, deviceID)
	if err != nil {
		t.Fatalf("PollToken: %v", err)
	}
	if result.Status != SessionStatusExpired {
		t.Fatalf("unexpected status: %s", result.Status)
	}
	if result.Error != "expired" {
		t.Fatalf("unexpected error: %q", result.Error)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet: %v", err)
	}
}

func TestAuthorizeDeviceSessionTracksEventInCloudMode(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "1")
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	mock.ExpectExec(regexp.QuoteMeta(`INSERT INTO device_auth_log (id, device_id, device_name, status, email, workspace_id, expires_at)
		 SELECT $2, device_id, device_name, $3, $4, $5, expires_at
		 FROM device_auth_log
		 WHERE id = (
		   SELECT id
		   FROM device_auth_log
		   WHERE device_id = $1
		   ORDER BY created_at DESC
		   LIMIT 1
		 )
		   AND status = $6
		   AND expires_at > CURRENT_TIMESTAMP`)).
		WithArgs("dev-track", sqlmock.AnyArg(), SessionStatusAuthorized, "user@example.com", "workspace-1", SessionStatusPending).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(regexp.QuoteMeta(`INSERT INTO track_events (email, event_name, event_data_json)
		VALUES ($1, $2, $3)`)).
		WithArgs("user@example.com", deviceAuthAuthorizedEventName, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))

	updated, err := AuthorizeDeviceSession(context.Background(), db, "dev-track", "user@example.com", "workspace-1")
	if err != nil {
		t.Fatalf("AuthorizeDeviceSession: %v", err)
	}
	if !updated {
		t.Fatal("expected session to be updated")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet: %v", err)
	}
}
