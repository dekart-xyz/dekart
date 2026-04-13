package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"time"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/awserr"
	"github.com/aws/aws-sdk-go/service/s3"
)

const (
	defaultS3SessionTTL = time.Hour
)

type s3MultipartSession struct {
	BucketName  string
	ObjectName  string
	UploadID    string
	TotalSize   int64
	ExpiresUnix int64
}

func (s S3Storage) StartUploadSession(ctx context.Context, input StartUploadSessionInput) (*StartUploadSessionOutput, error) {
	if input.BucketName == "" || input.ObjectName == "" {
		return nil, fmt.Errorf("bucket and object are required")
	}
	if input.MaxPartSize <= 0 || input.TotalSize <= 0 {
		return nil, fmt.Errorf("total_size and max_part_size must be positive")
	}

	result, err := s.client.CreateMultipartUploadWithContext(ctx, &s3.CreateMultipartUploadInput{
		Bucket:      aws.String(input.BucketName),
		Key:         aws.String(input.ObjectName),
		ContentType: aws.String("application/octet-stream"),
	})
	if err != nil {
		return nil, err
	}
	if result.UploadId == nil || *result.UploadId == "" {
		return nil, fmt.Errorf("missing multipart upload id")
	}

	expiresAt := time.Now().Add(defaultS3SessionTTL)
	sessionID := createS3Session(s3MultipartSession{
		BucketName:  input.BucketName,
		ObjectName:  input.ObjectName,
		UploadID:    *result.UploadId,
		TotalSize:   input.TotalSize,
		ExpiresUnix: expiresAt.Unix(),
	})

	return &StartUploadSessionOutput{
		ProviderSessionID: sessionID,
		MaxPartSize:       input.MaxPartSize,
		RequiredHeaders: []UploadHeader{
			{Key: "Content-Type", Value: "application/octet-stream"},
		},
		ExpiresAt: expiresAt,
	}, nil
}

func (s S3Storage) UploadPart(ctx context.Context, input UploadPartInput) (*UploadPartOutput, error) {
	session, err := loadAndValidateS3Session(input.ProviderSessionID, input.BucketName, input.ObjectName)
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

	partData, err := readExactPart(input.Body, input.PartSize)
	if err != nil {
		return nil, err
	}
	uploadPartResult, err := s.client.UploadPartWithContext(ctx, &s3.UploadPartInput{
		Bucket:        aws.String(input.BucketName),
		Key:           aws.String(input.ObjectName),
		UploadId:      aws.String(session.UploadID),
		PartNumber:    aws.Int64(input.PartNumber),
		ContentLength: aws.Int64(input.PartSize),
		Body:          bytes.NewReader(partData),
	})
	if err != nil {
		return nil, err
	}

	return &UploadPartOutput{
		ETag: aws.StringValue(uploadPartResult.ETag),
		Size: int64(len(partData)),
	}, nil
}

func (s S3Storage) CompleteUploadSession(ctx context.Context, input CompleteUploadSessionInput) (*CompleteUploadSessionOutput, error) {
	session, err := loadAndValidateS3Session(input.ProviderSessionID, input.BucketName, input.ObjectName)
	if err != nil {
		return nil, err
	}
	if len(input.Parts) == 0 {
		return nil, fmt.Errorf("parts are required")
	}

	completedParts := make([]*s3.CompletedPart, len(input.Parts))
	var totalSize int64
	for i, part := range input.Parts {
		// why: enforce deterministic completion order and prevent missing/duplicated chunks.
		if part.PartNumber != int64(i+1) {
			return nil, fmt.Errorf("parts must be contiguous and ordered from 1")
		}
		if part.Size <= 0 {
			return nil, fmt.Errorf("part size must be positive")
		}
		totalSize += part.Size
		completedParts[i] = &s3.CompletedPart{
			ETag:       aws.String(part.ETag),
			PartNumber: aws.Int64(part.PartNumber),
		}
	}
	if totalSize != session.TotalSize {
		return nil, fmt.Errorf("total_size does not match session total_size")
	}
	if input.TotalSize != session.TotalSize {
		// why: reject client attempts to complete with a different total than the one declared at start.
		return nil, fmt.Errorf("total_size does not match started upload session")
	}

	_, err = s.client.CompleteMultipartUploadWithContext(ctx, &s3.CompleteMultipartUploadInput{
		Bucket:   aws.String(input.BucketName),
		Key:      aws.String(input.ObjectName),
		UploadId: aws.String(session.UploadID),
		MultipartUpload: &s3.CompletedMultipartUpload{
			Parts: completedParts,
		},
	})
	if err != nil {
		if isS3NoSuchUpload(err) {
			// why: support retry when previous complete already finalized object.
			return s.verifyCompletedS3Object(ctx, input.BucketName, input.ObjectName, session.TotalSize)
		}
		return nil, err
	}
	return s.verifyCompletedS3Object(ctx, input.BucketName, input.ObjectName, session.TotalSize)
}

func (s S3Storage) AbortUploadSession(ctx context.Context, input AbortUploadSessionInput) error {
	session, err := loadAndValidateS3Session(input.ProviderSessionID, input.BucketName, input.ObjectName)
	if err != nil {
		return err
	}
	defer deleteS3Session(input.ProviderSessionID)

	_, err = s.client.AbortMultipartUploadWithContext(ctx, &s3.AbortMultipartUploadInput{
		Bucket:   aws.String(input.BucketName),
		Key:      aws.String(input.ObjectName),
		UploadId: aws.String(session.UploadID),
	})
	if err != nil && !isS3NoSuchUpload(err) {
		return err
	}
	return nil
}

func (s S3Storage) verifyCompletedS3Object(ctx context.Context, bucketName, objectName string, expectedSize int64) (*CompleteUploadSessionOutput, error) {
	head, err := s.client.HeadObjectWithContext(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(bucketName),
		Key:    aws.String(objectName),
	})
	if err != nil {
		return nil, err
	}
	if aws.Int64Value(head.ContentLength) != expectedSize {
		return nil, fmt.Errorf("final object size mismatch: expected %d, got %d", expectedSize, aws.Int64Value(head.ContentLength))
	}
	return &CompleteUploadSessionOutput{
		SourceID: objectName,
		Size:     expectedSize,
	}, nil
}

func readExactPart(reader io.Reader, expectedSize int64) ([]byte, error) {
	partData, err := io.ReadAll(io.LimitReader(reader, expectedSize+1))
	if err != nil {
		return nil, err
	}
	if int64(len(partData)) != expectedSize {
		return nil, fmt.Errorf("part size mismatch: expected %d, got %d", expectedSize, len(partData))
	}
	return partData, nil
}

func isS3NoSuchUpload(err error) bool {
	awsErr, ok := err.(awserr.Error)
	if !ok {
		return false
	}
	return awsErr.Code() == "NoSuchUpload"
}
