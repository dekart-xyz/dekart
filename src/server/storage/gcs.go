package storage

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/bqutils"
	"dekart/src/server/conn"
	"dekart/src/server/errtype"
	"fmt"
	"io"
	"os"
	"time"

	gcsstorage "cloud.google.com/go/storage"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"google.golang.org/api/iterator"
)

// GoogleCloudStorage implements Storage interface for Google Cloud Storage.
type GoogleCloudStorage struct {
	defaultBucketName string
	logger            zerolog.Logger
	useUserToken      bool // if false ignore user token in ctx and use default service account
}

// CanSaveQuery returns true if the storage can save SQL query text.
func (s GoogleCloudStorage) CanSaveQuery(_ context.Context, bucketName string) bool {
	return bucketName != ""
}

// GetDefaultBucketName returns configured default GCS bucket.
func (s GoogleCloudStorage) GetDefaultBucketName() string {
	return s.defaultBucketName
}

// NewGoogleCloudStorage creates GCS storage using user token context.
func NewGoogleCloudStorage() *GoogleCloudStorage {
	defaultBucketName := os.Getenv("DEKART_CLOUD_STORAGE_BUCKET")
	if defaultBucketName == "" {
		log.Info().Msg("DEKART_CLOUD_STORAGE_BUCKET is not set, using user provided bucket")
	}
	return &GoogleCloudStorage{
		defaultBucketName: defaultBucketName,
		logger:            log.With().Str("DEKART_CLOUD_STORAGE_BUCKET", defaultBucketName).Logger(),
		useUserToken:      true,
	}
}

// NewPublicStorage creates GCS storage using application account context.
func NewPublicStorage() *GoogleCloudStorage {
	defaultBucketName := os.Getenv("DEKART_CLOUD_PUBLIC_STORAGE_BUCKET")
	if defaultBucketName == "" {
		defaultBucketName = os.Getenv("DEKART_CLOUD_STORAGE_BUCKET")
	}
	if defaultBucketName == "" {
		log.Fatal().Msg("DEKART_CLOUD_PUBLIC_STORAGE_BUCKET and DEKART_CLOUD_STORAGE_BUCKET are not set")
	}
	return &GoogleCloudStorage{
		defaultBucketName: defaultBucketName,
		logger:            log.With().Str("defaultBucketName", defaultBucketName).Logger(),
		useUserToken:      false,
	}
}

// TestConnection checks if the provided bucket is accessible with current credentials.
func TestConnection(ctx context.Context, connection *proto.Connection) (*proto.TestConnectionResponse, error) {
	client, err := bqutils.GetStorageClient(ctx, connection, false)
	if err != nil {
		return &proto.TestConnectionResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}
	bucket := client.Bucket(connection.CloudStorageBucket)

	it := bucket.Objects(ctx, nil)
	_, err = it.Next()
	if err != nil {
		if err == iterator.Done {
			return &proto.TestConnectionResponse{Success: true}, nil
		}
		return &proto.TestConnectionResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}

	return &proto.TestConnectionResponse{Success: true}, nil
}

// GetObject creates a GCS object handle wrapper.
func (s GoogleCloudStorage) GetObject(_ context.Context, bucketName, object string) StorageObject {
	if bucketName == "" {
		log.Warn().Msg("bucketName is not set")
	}
	return GoogleCloudStorageObject{
		bucketName:   bucketName,
		object:       object,
		logger:       s.logger.With().Str("GoogleCloudStorageObject", object).Logger(),
		useUserToken: s.useUserToken,
	}
}

// GoogleCloudStorageObject implements StorageObject for Google Cloud Storage.
type GoogleCloudStorageObject struct {
	bucketName   string
	object       string
	logger       zerolog.Logger
	useUserToken bool // if false ignore user token in ctx and use default service account
}

// CopyFromS3 copies object from S3 URI into GCS object.
func (o GoogleCloudStorageObject) CopyFromS3(_ context.Context, _ string) error {
	log.Fatal().Msg("method not implemented")
	return nil
}

// CopyTo streams object content to provided writer.
func (o GoogleCloudStorageObject) CopyTo(ctx context.Context, writer io.WriteCloser) error {
	reader, err := o.GetReader(ctx)
	if err != nil {
		errtype.LogError(err, "Error getting reader while copying to Google Cloud Storage")
		return err
	}
	_, err = io.Copy(writer, reader)
	if err != nil {
		errtype.LogError(err, "Error while copying to Google Cloud Storage")
		return err
	}
	if err = writer.Close(); err != nil {
		errtype.LogError(err, "Error closing writer while copying to Google Cloud Storage")
		return err
	}
	return nil
}

// Delete removes object from GCS.
func (o GoogleCloudStorageObject) Delete(ctx context.Context) error {
	obj, err := o.getObject(ctx)
	if err != nil {
		return err
	}
	if err = obj.Delete(ctx); err != nil {
		o.logger.Error().Err(err).Msg("error deleting object")
		return err
	}
	return nil
}

func (o GoogleCloudStorageObject) getObject(ctx context.Context) (*gcsstorage.ObjectHandle, error) {
	client, err := bqutils.GetStorageClient(ctx, conn.FromCtx(ctx), !o.useUserToken)
	if err != nil {
		errtype.LogError(err, "error getting storage client")
		return nil, err
	}
	bucket := client.Bucket(o.bucketName)
	return bucket.Object(o.object), nil
}

// GetWriter returns object writer for GCS uploads.
func (o GoogleCloudStorageObject) GetWriter(ctx context.Context) io.WriteCloser {
	obj, err := o.getObject(ctx)
	if err != nil {
		return errorWriteCloser{err: err}
	}
	writer := obj.NewWriter(ctx)
	writer.ChunkSize = 0
	return writer
}

// GetReader returns object reader for GCS downloads.
func (o GoogleCloudStorageObject) GetReader(ctx context.Context) (io.ReadCloser, error) {
	obj, err := o.getObject(ctx)
	if err != nil {
		return nil, err
	}
	return obj.NewReader(ctx)
}

// GetCreatedAt returns object created timestamp.
func (o GoogleCloudStorageObject) GetCreatedAt(ctx context.Context) (*time.Time, error) {
	obj, err := o.getObject(ctx)
	if err != nil {
		return nil, err
	}
	attrs, err := obj.Attrs(ctx)
	if err != nil {
		o.logger.Error().Stack().Err(err).Msg("error getting attributes")
		return nil, err
	}
	return &attrs.Created, nil
}

// GetSize returns object size in bytes.
func (o GoogleCloudStorageObject) GetSize(ctx context.Context) (*int64, error) {
	obj, err := o.getObject(ctx)
	if err != nil {
		return nil, err
	}
	attrs, err := obj.Attrs(ctx)
	if err != nil {
		o.logger.Error().Err(err).Msg("error getting attributes")
		return nil, err
	}
	return &attrs.Size, nil
}

func partObjectName(prefix string, partNumber int64) string {
	return fmt.Sprintf("%s/part-%06d", prefix, partNumber)
}
