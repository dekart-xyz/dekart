package storage

import (
	"context"
	"io"
	"os"
	"time"

	"cloud.google.com/go/storage"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

type StorageObject interface {
	GetReader(context.Context) (io.ReadCloser, error)
	GetWriter(context.Context) io.WriteCloser
	GetCreatedAt(context.Context) (*time.Time, error)
	GetSize(context.Context) (*int64, error)
}

type Storage interface {
	GetObject(string) StorageObject
}

//GoogleCloudStorage implements Storage interface for Google Cloud Storage
type GoogleCloudStorage struct {
	bucket *storage.BucketHandle
	logger zerolog.Logger
}

func NewGoogleCloudStorage() GoogleCloudStorage {
	ctx := context.Background()
	client, err := storage.NewClient(ctx)
	if err != nil {
		log.Fatal().Err(err).Send()
	}
	bucketName := os.Getenv("DEKART_CLOUD_STORAGE_BUCKET")
	if bucketName == "" {
		log.Fatal().Msg("DEKART_CLOUD_STORAGE_BUCKET is not set")
	}
	bucket := client.Bucket(bucketName)
	return GoogleCloudStorage{
		bucket: bucket,
		logger: log.With().Str("DEKART_CLOUD_STORAGE_BUCKET", bucketName).Logger(),
	}
}

func (s GoogleCloudStorage) GetObject(object string) StorageObject {
	obj := s.bucket.Object(object)
	return GoogleCloudStorageObject{
		obj:    obj,
		logger: s.logger.With().Str("GoogleCloudStorageObject", object).Logger(),
	}
}

//GoogleCloudStorageObject implements StorageObject interface for Google Cloud Storage
type GoogleCloudStorageObject struct {
	obj    *storage.ObjectHandle
	logger zerolog.Logger
}

func (o GoogleCloudStorageObject) GetWriter(ctx context.Context) io.WriteCloser {
	writer := o.obj.NewWriter(ctx)
	writer.ChunkSize = 0
	return writer
}

func (o GoogleCloudStorageObject) GetReader(ctx context.Context) (io.ReadCloser, error) {
	return o.obj.NewReader(ctx)
}

func (o GoogleCloudStorageObject) GetCreatedAt(ctx context.Context) (*time.Time, error) {
	attrs, err := o.obj.Attrs(ctx)
	if err != nil {
		o.logger.Error().Err(err).Msg("error getting attributes")
		return nil, err
	}
	return &attrs.Created, nil
}

func (o GoogleCloudStorageObject) GetSize(ctx context.Context) (*int64, error) {
	attrs, err := o.obj.Attrs(ctx)
	if err != nil {
		o.logger.Error().Err(err).Msg("error getting attributes")
		return nil, err
	}
	return &attrs.Size, nil
}
