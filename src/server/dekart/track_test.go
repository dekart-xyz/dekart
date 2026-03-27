package dekart

import (
	"context"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestTrackVersionCheckStoresEvent(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "1")
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	s := Server{db: db}
	mock.ExpectExec(regexp.QuoteMeta(`INSERT INTO track_events (email, event_name, event_data_json)
		VALUES ($1, $2, $3)`)).
		WithArgs(
			"example.com",
			versionCheckEventName,
			`{"app_domain":"example.com","current_version":"0.0.0","latest_version":"v0.21.0","outcome":"update_available"}`,
		).
		WillReturnResult(sqlmock.NewResult(1, 1))

	s.TrackVersionCheck(context.Background(), "Example.com", "0.0.0", "v0.21.0", "update_available")

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet: %v", err)
	}
}

func TestTrackVersionCheckSkipsWithoutCloudFlag(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "")
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer db.Close()

	s := Server{db: db}
	s.TrackVersionCheck(context.Background(), "example.com", "0.0.0", "v0.21.0", "update_available")

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet: %v", err)
	}
}
