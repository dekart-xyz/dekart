package storage

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
)

const localFSSessionTTL = time.Hour

type localFSSessionMeta struct {
	BucketName  string `json:"bucket_name"`
	ObjectName  string `json:"object_name"`
	TotalSize   int64  `json:"total_size"`
	MaxPartSize int64  `json:"max_part_size"`
	CreatedAt   int64  `json:"created_at_unix"`
	ExpiresAt   int64  `json:"expires_at_unix"`
}

type LocalFSStorage struct {
	rootDir string
}

func NewLocalFSStorage(root string) *LocalFSStorage {
	return &LocalFSStorage{rootDir: root}
}

func (s LocalFSStorage) CanSaveQuery(_ context.Context, _ string) bool {
	return false
}

func (s LocalFSStorage) GetObject(_ context.Context, _ string, object string) StorageObject {
	return NewLocalFSStorageObject(s.rootDir, object)
}

func (s LocalFSStorage) ListObjectsByPrefix(_ context.Context, _ string, _ string) ([]ObjectInfo, error) {
	return nil, fmt.Errorf("list objects flow is not supported for storage backend %q", "localfs")
}

func (s LocalFSStorage) StartUploadSession(_ context.Context, input StartUploadSessionInput) (*StartUploadSessionOutput, error) {
	if input.ObjectName == "" {
		return nil, fmt.Errorf("object is required")
	}
	if input.TotalSize <= 0 || input.MaxPartSize <= 0 {
		return nil, fmt.Errorf("total_size and max_part_size must be positive")
	}
	sessionID := uuid.NewString()
	sessionDir := s.sessionDir(sessionID)
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	meta := localFSSessionMeta{
		BucketName:  input.BucketName,
		ObjectName:  input.ObjectName,
		TotalSize:   input.TotalSize,
		MaxPartSize: input.MaxPartSize,
		CreatedAt:   now.Unix(),
		ExpiresAt:   now.Add(localFSSessionTTL).Unix(),
	}
	if err := s.writeSessionMeta(sessionID, meta); err != nil {
		return nil, err
	}
	return &StartUploadSessionOutput{
		ProviderSessionID: sessionID,
		MaxPartSize:       input.MaxPartSize,
		RequiredHeaders:   []UploadHeader{},
		ExpiresAt:         time.Unix(meta.ExpiresAt, 0).UTC(),
	}, nil
}

func (s LocalFSStorage) UploadPart(_ context.Context, input UploadPartInput) (*UploadPartOutput, error) {
	if input.ProviderSessionID == "" {
		return nil, fmt.Errorf("provider_session_id is required")
	}
	if input.PartNumber < 1 {
		return nil, fmt.Errorf("part_number must be >= 1")
	}
	if input.PartSize <= 0 {
		return nil, fmt.Errorf("part_size must be positive")
	}
	if input.Body == nil {
		return nil, fmt.Errorf("part body is required")
	}
	meta, err := s.readAndValidateSession(input.ProviderSessionID, input.BucketName, input.ObjectName)
	if err != nil {
		return nil, err
	}
	if input.PartSize > meta.MaxPartSize {
		return nil, fmt.Errorf("part_size exceeds max_part_size")
	}
	partPath := s.sessionPartPath(input.ProviderSessionID, input.PartNumber)
	file, err := os.Create(partPath)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	h := sha1.New() // why: deterministic etag-like marker for multipart part manifests.
	written, err := io.Copy(io.MultiWriter(file, h), io.LimitReader(input.Body, input.PartSize+1))
	if err != nil {
		_ = os.Remove(partPath)
		return nil, err
	}
	if written != input.PartSize {
		_ = os.Remove(partPath)
		return nil, fmt.Errorf("part size mismatch: expected %d, got %d", input.PartSize, written)
	}
	if err := file.Sync(); err != nil {
		_ = os.Remove(partPath)
		return nil, err
	}
	return &UploadPartOutput{
		ETag: hex.EncodeToString(h.Sum(nil)),
		Size: written,
	}, nil
}

func (s LocalFSStorage) CompleteUploadSession(_ context.Context, input CompleteUploadSessionInput) (*CompleteUploadSessionOutput, error) {
	if input.ProviderSessionID == "" {
		return nil, fmt.Errorf("provider_session_id is required")
	}
	meta, err := s.readAndValidateSession(input.ProviderSessionID, input.BucketName, input.ObjectName)
	if err != nil {
		return nil, err
	}
	if len(input.Parts) == 0 {
		return nil, fmt.Errorf("parts are required")
	}
	if input.TotalSize != meta.TotalSize {
		return nil, fmt.Errorf("total_size does not match started upload session")
	}

	var totalSize int64
	for i, part := range input.Parts {
		expectedPartNum := int64(i + 1)
		if part.PartNumber != expectedPartNum {
			return nil, fmt.Errorf("parts must be contiguous and ordered from 1")
		}
		if part.Size <= 0 {
			return nil, fmt.Errorf("part size must be positive")
		}
		totalSize += part.Size
		partPath := s.sessionPartPath(input.ProviderSessionID, part.PartNumber)
		info, err := os.Stat(partPath)
		if err != nil {
			return nil, err
		}
		if info.Size() != part.Size {
			return nil, fmt.Errorf("part size mismatch for part %d", part.PartNumber)
		}
	}
	if totalSize != meta.TotalSize {
		return nil, fmt.Errorf("total_size does not match session total_size")
	}

	objectPath, err := localFSResolvePath(s.rootDir, meta.ObjectName)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(objectPath), 0o755); err != nil {
		return nil, err
	}
	out, err := os.Create(objectPath)
	if err != nil {
		return nil, err
	}
	for _, part := range input.Parts {
		partPath := s.sessionPartPath(input.ProviderSessionID, part.PartNumber)
		in, err := os.Open(partPath)
		if err != nil {
			_ = out.Close()
			return nil, err
		}
		if _, err := io.Copy(out, in); err != nil {
			_ = in.Close()
			_ = out.Close()
			return nil, err
		}
		_ = in.Close()
	}
	if err := out.Sync(); err != nil {
		_ = out.Close()
		return nil, err
	}
	if err := out.Close(); err != nil {
		return nil, err
	}
	if err := os.RemoveAll(s.sessionDir(input.ProviderSessionID)); err != nil {
		return nil, err
	}
	return &CompleteUploadSessionOutput{
		SourceID: meta.ObjectName,
		Size:     totalSize,
	}, nil
}

func (s LocalFSStorage) AbortUploadSession(_ context.Context, input AbortUploadSessionInput) error {
	if input.ProviderSessionID == "" {
		return fmt.Errorf("provider_session_id is required")
	}
	if err := os.RemoveAll(s.sessionDir(input.ProviderSessionID)); err != nil {
		return err
	}
	return nil
}

func (s LocalFSStorage) sessionRootDir() string {
	return filepath.Join(s.rootDir, ".upload_sessions")
}

func (s LocalFSStorage) sessionDir(sessionID string) string {
	return filepath.Join(s.sessionRootDir(), sessionID)
}

func (s LocalFSStorage) sessionMetaPath(sessionID string) string {
	return filepath.Join(s.sessionDir(sessionID), "meta.json")
}

func (s LocalFSStorage) sessionPartPath(sessionID string, partNumber int64) string {
	return filepath.Join(s.sessionDir(sessionID), fmt.Sprintf("part-%06d", partNumber))
}

func (s LocalFSStorage) writeSessionMeta(sessionID string, meta localFSSessionMeta) error {
	path := s.sessionMetaPath(sessionID)
	bytes, err := json.Marshal(meta)
	if err != nil {
		return err
	}
	return os.WriteFile(path, bytes, 0o644)
}

func (s LocalFSStorage) readAndValidateSession(sessionID string, bucketName string, objectName string) (localFSSessionMeta, error) {
	path := s.sessionMetaPath(sessionID)
	bytes, err := os.ReadFile(path)
	if err != nil {
		return localFSSessionMeta{}, err
	}
	meta := localFSSessionMeta{}
	if err := json.Unmarshal(bytes, &meta); err != nil {
		return localFSSessionMeta{}, err
	}
	if meta.BucketName != bucketName || meta.ObjectName != objectName {
		return localFSSessionMeta{}, fmt.Errorf("upload session metadata mismatch")
	}
	if time.Now().UTC().After(time.Unix(meta.ExpiresAt, 0).UTC()) {
		return localFSSessionMeta{}, fmt.Errorf("upload session expired")
	}
	return meta, nil
}
