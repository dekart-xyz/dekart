package dekart

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"dekart/src/proto"
	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gorilla/mux"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestGetBackupTargetUsesObjectStorageForBucketBackends(t *testing.T) {
	for _, storageBackend := range []string{"S3", "GCS", "PG"} {
		t.Run(storageBackend, func(t *testing.T) {
			t.Setenv("DEKART_STORAGE", storageBackend)
			t.Setenv("DEKART_CLOUD_STORAGE_BUCKET", "sqlite-backups")
			t.Setenv("DEKART_SNOWFLAKE_STAGE", "")

			if got := getBackupTarget(); got != backupTargetObjectStorage {
				t.Fatalf("expected object storage backup target, got %q", got)
			}
		})
	}
}

func TestGetBackupTargetDisablesPGWithoutBucket(t *testing.T) {
	t.Setenv("DEKART_STORAGE", "PG")
	t.Setenv("DEKART_CLOUD_STORAGE_BUCKET", "")
	t.Setenv("DEKART_SNOWFLAKE_STAGE", "")

	if got := getBackupTarget(); got != backupTargetDisabled {
		t.Fatalf("expected disabled backup target, got %q", got)
	}
}

func TestSQLiteBackupObjectNameUsesTargetLayout(t *testing.T) {
	t.Setenv("DEKART_SQLITE_DB_PATH", "/data/dekart.db")
	ts := time.Date(2026, 6, 29, 14, 57, 18, 0, time.UTC)

	if got := sqliteBackupObjectName(ts, backupTargetSnowflakeStage); got != "dekart.db_20260629_145718.backup" {
		t.Fatalf("expected Snowflake stage root backup, got %q", got)
	}
	if got := sqliteBackupObjectName(ts, backupTargetObjectStorage); got != "sqlite-backups/dekart.db_20260629_145718.backup" {
		t.Fatalf("expected object storage prefixed backup, got %q", got)
	}
}

func TestCanStoreMapPreview(t *testing.T) {
	for _, tc := range []struct {
		name           string
		storageBackend string
		want           bool
	}{
		{name: "S3", storageBackend: "S3", want: true},
		{name: "GCS", storageBackend: "GCS", want: true},
		{name: "PG", storageBackend: "PG", want: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("DEKART_STORAGE", tc.storageBackend)
			t.Setenv("DEKART_CLOUD_STORAGE_BUCKET", "sqlite-backups")

			if got := canStoreMapPreview(); got != tc.want {
				t.Fatalf("expected canStoreMapPreview=%t, got %t", tc.want, got)
			}
		})
	}
}

func TestSaveMapPreviewRejectsPGBackupBucket(t *testing.T) {
	t.Setenv("DEKART_STORAGE", "PG")
	t.Setenv("DEKART_CLOUD_STORAGE_BUCKET", "sqlite-backups")

	_, err := (Server{}).SaveMapPreview(context.Background(), &proto.SaveMapPreviewRequest{})
	if status.Code(err) != codes.PermissionDenied {
		t.Fatalf("expected permission denied, got %v", err)
	}
}

func TestServeMapPreviewUsesDefaultForPGBackupBucket(t *testing.T) {
	t.Setenv("DEKART_STORAGE", "PG")
	t.Setenv("DEKART_CLOUD_STORAGE_BUCKET", "sqlite-backups")
	t.Setenv("DEKART_STATIC_FILES", "")
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	reportID := "00000000-0000-0000-0000-000000000004"
	email := "user@example.com"
	expectSnapshotReportAccess(mock, reportID, email)
	server := Server{db: db}
	request := httptest.NewRequest(http.MethodGet, "/reports/"+reportID+"/map-preview", nil)
	request = request.WithContext(snapshotTestContext(email))
	request = mux.SetURLVars(request, map[string]string{"report": reportID})
	recorder := httptest.NewRecorder()

	server.ServeMapPreview(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected default preview response, got status %d", recorder.Code)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
