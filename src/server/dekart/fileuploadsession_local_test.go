package dekart

import (
	"bytes"
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/storage"
	"os"
	"path/filepath"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func TestLocalUploadRoundTripAndFileStatusTransitions(t *testing.T) {
	root := t.TempDir()
	t.Setenv("DEKART_LOCAL_FILES_ROOT", root)

	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("sql.Open: %v", err)
	}
	defer db.Close()

	_, err = db.Exec(`
		CREATE TABLE files (
			id TEXT PRIMARY KEY,
			name TEXT,
			size INTEGER,
			mime_type TEXT,
			file_status INTEGER,
			file_source_id TEXT,
			upload_error TEXT,
			updated_at TIMESTAMP
		);
	`)
	if err != nil {
		t.Fatalf("create table: %v", err)
	}
	_, err = db.Exec(`INSERT INTO files (id, file_status) VALUES (?, ?)`, "file-1", int(proto.File_STATUS_NEW))
	if err != nil {
		t.Fatalf("insert file row: %v", err)
	}

	s := Server{db: db}
	req := &proto.CreateFileUploadSessionRequest{
		Name:      "test.csv",
		MimeType:  "text/csv",
		TotalSize: 12,
	}
	if err := s.markFileUploadStarted(context.Background(), "file-1", "11111111-1111-1111-1111-111111111111", req); err != nil {
		t.Fatalf("markFileUploadStarted: %v", err)
	}

	var statusAfterStart int64
	var sizeAfterStart int64
	if err := db.QueryRow(`SELECT file_status, size FROM files WHERE id=?`, "file-1").Scan(&statusAfterStart, &sizeAfterStart); err != nil {
		t.Fatalf("select started status: %v", err)
	}
	if statusAfterStart != int64(proto.File_STATUS_RECEIVED) {
		t.Fatalf("unexpected status after start: %d", statusAfterStart)
	}
	if sizeAfterStart != 12 {
		t.Fatalf("unexpected size after start: %d", sizeAfterStart)
	}

	local := storage.NewLocalFSStorage(root)
	objectName, err := buildFileObjectName("11111111-1111-1111-1111-111111111111", "text/csv")
	if err != nil {
		t.Fatalf("buildFileObjectName: %v", err)
	}

	start, err := local.StartUploadSession(context.Background(), storage.StartUploadSessionInput{
		ObjectName:  objectName,
		TotalSize:   12,
		MaxPartSize: 12,
	})
	if err != nil {
		t.Fatalf("StartUploadSession: %v", err)
	}
	part, err := local.UploadPart(context.Background(), storage.UploadPartInput{
		ObjectName:        objectName,
		ProviderSessionID: start.ProviderSessionID,
		PartNumber:        1,
		PartSize:          12,
		Body:              bytes.NewBufferString("hello,world\n"),
	})
	if err != nil {
		t.Fatalf("UploadPart: %v", err)
	}
	_, err = local.CompleteUploadSession(context.Background(), storage.CompleteUploadSessionInput{
		ObjectName:        objectName,
		ProviderSessionID: start.ProviderSessionID,
		TotalSize:         12,
		Parts: []storage.CompleteUploadPart{
			{PartNumber: 1, ETag: part.ETag, Size: part.Size},
		},
	})
	if err != nil {
		t.Fatalf("CompleteUploadSession: %v", err)
	}

	if err := s.markFileUploadCompleted(context.Background(), "file-1", 12); err != nil {
		t.Fatalf("markFileUploadCompleted: %v", err)
	}
	var statusAfterComplete int64
	var sizeAfterComplete int64
	if err := db.QueryRow(`SELECT file_status, size FROM files WHERE id=?`, "file-1").Scan(&statusAfterComplete, &sizeAfterComplete); err != nil {
		t.Fatalf("select completed status: %v", err)
	}
	if statusAfterComplete != int64(proto.File_STATUS_STORED) {
		t.Fatalf("unexpected status after complete: %d", statusAfterComplete)
	}
	if sizeAfterComplete != 12 {
		t.Fatalf("unexpected size after complete: %d", sizeAfterComplete)
	}

	content, err := os.ReadFile(filepath.Join(root, objectName))
	if err != nil {
		t.Fatalf("read final object: %v", err)
	}
	if string(content) != "hello,world\n" {
		t.Fatalf("unexpected object content: %q", string(content))
	}
}
