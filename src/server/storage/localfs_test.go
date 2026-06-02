package storage

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestLocalFSUploadSessionRoundTrip(t *testing.T) {
	root := t.TempDir()
	s := NewLocalFSStorage(root)
	ctx := context.Background()

	start, err := s.StartUploadSession(ctx, StartUploadSessionInput{
		BucketName:  "",
		ObjectName:  "test-object.csv",
		TotalSize:   12,
		MaxPartSize: 12,
	})
	if err != nil {
		t.Fatalf("StartUploadSession: %v", err)
	}
	if start.ProviderSessionID == "" {
		t.Fatal("expected provider session id")
	}

	partBody := bytes.NewBufferString("hello,world\n")
	part, err := s.UploadPart(ctx, UploadPartInput{
		BucketName:        "",
		ObjectName:        "test-object.csv",
		ProviderSessionID: start.ProviderSessionID,
		PartNumber:        1,
		PartSize:          12,
		Body:              partBody,
	})
	if err != nil {
		t.Fatalf("UploadPart: %v", err)
	}
	if part.Size != 12 {
		t.Fatalf("unexpected part size: %d", part.Size)
	}
	if part.ETag == "" {
		t.Fatal("expected part etag")
	}

	complete, err := s.CompleteUploadSession(ctx, CompleteUploadSessionInput{
		BucketName:        "",
		ObjectName:        "test-object.csv",
		ProviderSessionID: start.ProviderSessionID,
		TotalSize:         12,
		Parts: []CompleteUploadPart{
			{PartNumber: 1, ETag: part.ETag, Size: part.Size},
		},
	})
	if err != nil {
		t.Fatalf("CompleteUploadSession: %v", err)
	}
	if complete.Size != 12 {
		t.Fatalf("unexpected final size: %d", complete.Size)
	}

	bytes, err := os.ReadFile(filepath.Join(root, "test-object.csv"))
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if string(bytes) != "hello,world\n" {
		t.Fatalf("unexpected file content: %q", string(bytes))
	}
}

func TestLocalFSAbortUploadSession(t *testing.T) {
	root := t.TempDir()
	s := NewLocalFSStorage(root)
	ctx := context.Background()

	start, err := s.StartUploadSession(ctx, StartUploadSessionInput{
		BucketName:  "",
		ObjectName:  "abort.csv",
		TotalSize:   3,
		MaxPartSize: 3,
	})
	if err != nil {
		t.Fatalf("StartUploadSession: %v", err)
	}
	if err := s.AbortUploadSession(ctx, AbortUploadSessionInput{
		BucketName:        "",
		ObjectName:        "abort.csv",
		ProviderSessionID: start.ProviderSessionID,
	}); err != nil {
		t.Fatalf("AbortUploadSession: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, ".upload_sessions", start.ProviderSessionID)); !os.IsNotExist(err) {
		t.Fatalf("expected session dir removed, stat err=%v", err)
	}
}

func TestLocalFSCompleteRejectsInvalidPartOrder(t *testing.T) {
	root := t.TempDir()
	s := NewLocalFSStorage(root)
	ctx := context.Background()

	start, err := s.StartUploadSession(ctx, StartUploadSessionInput{
		BucketName:  "",
		ObjectName:  "invalid-order.csv",
		TotalSize:   3,
		MaxPartSize: 3,
	})
	if err != nil {
		t.Fatalf("StartUploadSession: %v", err)
	}
	_, err = s.UploadPart(ctx, UploadPartInput{
		BucketName:        "",
		ObjectName:        "invalid-order.csv",
		ProviderSessionID: start.ProviderSessionID,
		PartNumber:        1,
		PartSize:          3,
		Body:              bytes.NewBufferString("abc"),
	})
	if err != nil {
		t.Fatalf("UploadPart: %v", err)
	}

	_, err = s.CompleteUploadSession(ctx, CompleteUploadSessionInput{
		BucketName:        "",
		ObjectName:        "invalid-order.csv",
		ProviderSessionID: start.ProviderSessionID,
		TotalSize:         3,
		Parts: []CompleteUploadPart{
			{PartNumber: 2, ETag: "x", Size: 3},
		},
	})
	if err == nil {
		t.Fatal("expected error for invalid part order")
	}
}
