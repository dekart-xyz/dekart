package storage

import (
	"context"
	"fmt"
	"time"
)

// UploadHeader defines a required HTTP header for direct upload requests.
type UploadHeader struct {
	Key   string
	Value string
}

// StartUploadSessionInput contains the data required to initialize provider upload state.
type StartUploadSessionInput struct {
	BucketName  string
	ObjectName  string
	TotalSize   int64
	MaxPartSize int64
}

// StartUploadSessionOutput contains provider upload session metadata returned at session start.
type StartUploadSessionOutput struct {
	ProviderSessionID string
	MaxPartSize       int64
	RequiredHeaders   []UploadHeader
	ExpiresAt         time.Time
}

// GetUploadPartInput requests upload target metadata for the next part number.
type GetUploadPartInput struct {
	BucketName        string
	ObjectName        string
	ProviderSessionID string
	PartNumber        int64
	PartSize          int64
}

// GetUploadPartOutput returns upload target metadata for one part.
type GetUploadPartOutput struct {
	TargetURL       string
	HTTPMethod      string
	RequiredHeaders []UploadHeader
	PartSize        int64
	ExpiresAt       time.Time
}

// CompleteUploadPart contains provider completion metadata for one uploaded part.
type CompleteUploadPart struct {
	PartNumber int64
	ETag       string
	Size       int64
}

// CompleteUploadSessionInput contains provider completion payload for a session.
type CompleteUploadSessionInput struct {
	BucketName        string
	ObjectName        string
	ProviderSessionID string
	Parts             []CompleteUploadPart
	TotalSize         int64
}

// CompleteUploadSessionOutput contains final provider object metadata after completion.
type CompleteUploadSessionOutput struct {
	SourceID string
	Size     int64
}

// AbortUploadSessionInput identifies provider upload state to abort.
type AbortUploadSessionInput struct {
	BucketName        string
	ObjectName        string
	ProviderSessionID string
}

func errUploadSessionNotSupported(backend string) error {
	return fmt.Errorf("upload session flow is not supported for storage backend %q", backend)
}

// UnsupportedUploadSessionStorage provides a base upload-session implementation for unsupported backends.
type UnsupportedUploadSessionStorage struct {
	Backend string
}

// NewUnsupportedUploadSessionStorage creates the unsupported upload-session base with backend label.
func NewUnsupportedUploadSessionStorage(backend string) UnsupportedUploadSessionStorage {
	return UnsupportedUploadSessionStorage{Backend: backend}
}

// StartUploadSession returns unsupported error for backends without upload-session support.
func (s UnsupportedUploadSessionStorage) StartUploadSession(_ context.Context, _ StartUploadSessionInput) (*StartUploadSessionOutput, error) {
	return nil, errUploadSessionNotSupported(s.Backend)
}

// GetUploadPart returns unsupported error for backends without upload-session support.
func (s UnsupportedUploadSessionStorage) GetUploadPart(_ context.Context, _ GetUploadPartInput) (*GetUploadPartOutput, error) {
	return nil, errUploadSessionNotSupported(s.Backend)
}

// CompleteUploadSession returns unsupported error for backends without upload-session support.
func (s UnsupportedUploadSessionStorage) CompleteUploadSession(_ context.Context, _ CompleteUploadSessionInput) (*CompleteUploadSessionOutput, error) {
	return nil, errUploadSessionNotSupported(s.Backend)
}

// AbortUploadSession returns unsupported error for backends without upload-session support.
func (s UnsupportedUploadSessionStorage) AbortUploadSession(_ context.Context, _ AbortUploadSessionInput) error {
	return errUploadSessionNotSupported(s.Backend)
}
