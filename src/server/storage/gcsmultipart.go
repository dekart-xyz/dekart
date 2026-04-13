package storage

import (
	"context"
	"dekart/src/server/bqutils"
	"dekart/src/server/conn"
	"fmt"
	"io"
	"time"

	gcsstorage "cloud.google.com/go/storage"
	"github.com/google/uuid"
	"google.golang.org/api/iterator"
)

const (
	defaultGCSSessionTTL = time.Hour
)

type gcsMultipartSession struct {
	BucketName  string `json:"bucket_name"`
	ObjectName  string `json:"object_name"`
	PartsPrefix string `json:"parts_prefix"`
	TotalSize   int64  `json:"total_size"`
	ExpiresUnix int64  `json:"expires_unix"`
}

func (s GoogleCloudStorage) StartUploadSession(_ context.Context, input StartUploadSessionInput) (*StartUploadSessionOutput, error) {
	if input.BucketName == "" || input.ObjectName == "" {
		return nil, fmt.Errorf("bucket and object are required")
	}
	if input.MaxPartSize <= 0 || input.TotalSize <= 0 {
		return nil, fmt.Errorf("total_size and max_part_size must be positive")
	}

	expiresAt := time.Now().Add(defaultGCSSessionTTL)
	session := gcsMultipartSession{
		BucketName:  input.BucketName,
		ObjectName:  input.ObjectName,
		PartsPrefix: fmt.Sprintf("%s.__upload_%s", input.ObjectName, uuid.NewString()),
		TotalSize:   input.TotalSize,
		ExpiresUnix: expiresAt.Unix(),
	}
	sessionID := createGCSSession(session)

	return &StartUploadSessionOutput{
		ProviderSessionID: sessionID,
		MaxPartSize:       input.MaxPartSize,
		RequiredHeaders: []UploadHeader{
			{Key: "Content-Type", Value: "application/octet-stream"},
		},
		ExpiresAt: expiresAt,
	}, nil
}

func (s GoogleCloudStorage) UploadPart(ctx context.Context, input UploadPartInput) (*UploadPartOutput, error) {
	session, err := loadAndValidateGCSSession(input.ProviderSessionID, input.BucketName, input.ObjectName)
	if err != nil {
		return nil, err
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
	expiresAt := time.Unix(session.ExpiresUnix, 0)
	if time.Now().UTC().After(expiresAt) {
		return nil, fmt.Errorf("upload session expired")
	}

	client, err := s.getStorageClient(ctx)
	if err != nil {
		return nil, err
	}
	bucket := client.Bucket(input.BucketName)
	targetObject := partObjectName(session.PartsPrefix, input.PartNumber)
	writer := bucket.Object(targetObject).NewWriter(ctx)
	writer.ContentType = "application/octet-stream"
	written, copyErr := io.Copy(writer, io.LimitReader(input.Body, input.PartSize+1))
	if copyErr != nil {
		_ = writer.Close()
		return nil, copyErr
	}
	if closeErr := writer.Close(); closeErr != nil {
		return nil, closeErr
	}
	if written != input.PartSize {
		_ = bucket.Object(targetObject).Delete(ctx)
		return nil, fmt.Errorf("part size mismatch: expected %d, got %d", input.PartSize, written)
	}
	attrs, err := bucket.Object(targetObject).Attrs(ctx)
	if err != nil {
		return nil, err
	}
	return &UploadPartOutput{
		ETag: attrs.Etag,
		Size: written,
	}, nil
}

func (s GoogleCloudStorage) CompleteUploadSession(ctx context.Context, input CompleteUploadSessionInput) (*CompleteUploadSessionOutput, error) {
	session, err := loadAndValidateGCSSession(input.ProviderSessionID, input.BucketName, input.ObjectName)
	if err != nil {
		return nil, err
	}
	if len(input.Parts) == 0 {
		return nil, fmt.Errorf("parts are required")
	}

	partObjects := make([]string, len(input.Parts))
	var totalSize int64
	for i, part := range input.Parts {
		// why: enforce deterministic composition order and prevent missing/duplicated chunks.
		if part.PartNumber != int64(i+1) {
			return nil, fmt.Errorf("parts must be contiguous and ordered from 1")
		}
		if part.Size <= 0 {
			return nil, fmt.Errorf("part size must be positive")
		}
		totalSize += part.Size
		partObjects[i] = partObjectName(session.PartsPrefix, part.PartNumber)
	}
	if totalSize != session.TotalSize {
		return nil, fmt.Errorf("total_size does not match session total_size")
	}
	if input.TotalSize != session.TotalSize {
		// why: reject client attempts to complete with a different total than the one declared at start.
		return nil, fmt.Errorf("total_size does not match started upload session")
	}

	client, err := s.getStorageClient(ctx)
	if err != nil {
		return nil, err
	}
	bucket := client.Bucket(input.BucketName)

	tempObjects, err := composeGCSObjects(ctx, bucket, partObjects, input.ObjectName, session.PartsPrefix)
	if err != nil {
		return nil, err
	}

	if err := deleteGCSObjects(ctx, bucket, tempObjects); err != nil {
		s.logger.Warn().Err(err).Msg("failed to cleanup temporary composed objects")
	}

	attrs, err := bucket.Object(input.ObjectName).Attrs(ctx)
	if err != nil {
		return nil, err
	}
	if attrs.Size != session.TotalSize {
		// why: fail closed on object-size mismatch so corrupted/incomplete uploads are never accepted.
		if deleteErr := bucket.Object(input.ObjectName).Delete(ctx); deleteErr != nil && deleteErr != gcsstorage.ErrObjectNotExist {
			s.logger.Warn().Err(deleteErr).Str("object", input.ObjectName).Msg("failed cleanup after size mismatch")
		}
		return nil, fmt.Errorf("final object size mismatch: expected %d, got %d", session.TotalSize, attrs.Size)
	}
	return &CompleteUploadSessionOutput{
		SourceID: input.ObjectName,
		Size:     attrs.Size,
	}, nil
}

func (s GoogleCloudStorage) AbortUploadSession(ctx context.Context, input AbortUploadSessionInput) error {
	session, err := loadAndValidateGCSSession(input.ProviderSessionID, input.BucketName, input.ObjectName)
	if err != nil {
		return err
	}
	defer deleteGCSSession(input.ProviderSessionID)
	client, err := s.getStorageClient(ctx)
	if err != nil {
		return err
	}
	bucket := client.Bucket(input.BucketName)
	iter := bucket.Objects(ctx, &gcsstorage.Query{Prefix: session.PartsPrefix + "/"})
	for {
		objAttrs, err := iter.Next()
		if err == iterator.Done {
			return nil
		}
		if err != nil {
			return err
		}
		if err = bucket.Object(objAttrs.Name).Delete(ctx); err != nil {
			return err
		}
	}
}

func (s GoogleCloudStorage) getStorageClient(ctx context.Context) (*gcsstorage.Client, error) {
	return bqutils.GetStorageClient(ctx, conn.FromCtx(ctx), !s.useUserToken)
}

func composeGCSObjects(ctx context.Context, bucket *gcsstorage.BucketHandle, sources []string, destination string, partsPrefix string) ([]string, error) {
	if len(sources) == 0 {
		return nil, fmt.Errorf("at least one source part is required")
	}
	if len(sources) == 1 {
		if _, err := bucket.Object(destination).CopierFrom(bucket.Object(sources[0])).Run(ctx); err != nil {
			return nil, err
		}
		return nil, nil
	}

	current := sources
	temporary := make([]string, 0)
	level := 0
	for len(current) > 32 {
		next := make([]string, 0, (len(current)+31)/32)
		for i := 0; i < len(current); i += 32 {
			end := i + 32
			if end > len(current) {
				end = len(current)
			}
			tmpObject := fmt.Sprintf("%s/compose-l%d-%03d", partsPrefix, level, i/32)
			if err := composeGCSChunk(ctx, bucket, current[i:end], tmpObject); err != nil {
				return nil, err
			}
			temporary = append(temporary, tmpObject)
			next = append(next, tmpObject)
		}
		current = next
		level++
	}

	if err := composeGCSChunk(ctx, bucket, current, destination); err != nil {
		return nil, err
	}
	return temporary, nil
}

func composeGCSChunk(ctx context.Context, bucket *gcsstorage.BucketHandle, sources []string, destination string) error {
	composerSources := make([]*gcsstorage.ObjectHandle, 0, len(sources))
	for _, source := range sources {
		composerSources = append(composerSources, bucket.Object(source))
	}
	_, err := bucket.Object(destination).ComposerFrom(composerSources...).Run(ctx)
	return err
}

func deleteGCSObjects(ctx context.Context, bucket *gcsstorage.BucketHandle, objects []string) error {
	for _, object := range objects {
		if err := bucket.Object(object).Delete(ctx); err != nil && err != gcsstorage.ErrObjectNotExist {
			return err
		}
	}
	return nil
}
