package dekart

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"dekart/src/proto"
	"dekart/src/server/storage"
	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gorilla/mux"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type backupTestStorage struct {
	storage.UnsupportedUploadSessionStorage
	objects map[string][]byte
}

type backupTestObject struct {
	data []byte
}

func (s backupTestStorage) GetObject(_ context.Context, _, name string) storage.StorageObject {
	return backupTestObject{data: s.objects[name]}
}

func (s backupTestStorage) ListObjectsByPrefix(_ context.Context, _, prefix string) ([]storage.ObjectInfo, error) {
	objects := make([]storage.ObjectInfo, 0)
	for name := range s.objects {
		if strings.HasPrefix(name, prefix) {
			objects = append(objects, storage.ObjectInfo{Name: name})
		}
	}
	return objects, nil
}

func (backupTestStorage) CanSaveQuery(context.Context, string) bool {
	return false
}

func (o backupTestObject) GetReader(context.Context) (io.ReadCloser, error) {
	return io.NopCloser(bytes.NewReader(o.data)), nil
}

func (backupTestObject) GetWriter(context.Context) io.WriteCloser {
	return nil
}

func (backupTestObject) GetCreatedAt(context.Context) (*time.Time, error) {
	return nil, nil
}

func (backupTestObject) GetSize(context.Context) (*int64, error) {
	return nil, nil
}

func (backupTestObject) CopyFromS3(context.Context, string) error {
	return nil
}

func (backupTestObject) CopyTo(context.Context, io.WriteCloser) error {
	return nil
}

func (backupTestObject) Delete(context.Context) error {
	return nil
}

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

func TestRestoreFromStorageRestoresLatestBackup(t *testing.T) {
	dbFilePath := filepath.Join(t.TempDir(), "dekart.db")
	st := backupTestStorage{
		UnsupportedUploadSessionStorage: storage.NewUnsupportedUploadSessionStorage("test"),
		objects: map[string][]byte{
			"sqlite-backups/dekart.db_20260601_120000.backup": []byte("old"),
			"sqlite-backups/dekart.db_20260602_120000.backup": []byte("latest"),
		},
	}

	restoreFromStorage(dbFilePath, st, "sqlite-backups")

	got, err := os.ReadFile(dbFilePath)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "latest" {
		t.Fatalf("expected latest backup, got %q", got)
	}
}
