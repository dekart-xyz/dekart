package storage

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/user"
	"io"
	"net/url"
	"os"
	"time"

	"cloud.google.com/go/storage"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/aws/aws-sdk-go/service/s3/s3manager"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"golang.org/x/sync/errgroup"
	"google.golang.org/api/option"
)

type StorageObject interface {
	GetReader(context.Context) (io.ReadCloser, error)
	GetWriter(context.Context) io.WriteCloser
	GetCreatedAt(context.Context) (*time.Time, error)
	GetSize(context.Context) (*int64, error)
	CopyFromS3(ctx context.Context, source string) error
}

type Storage interface {
	GetObject(string, string) StorageObject
}

func GetBucketName(userBucketName string) string {
	defaultBucketName := GetDefaultBucketName()
	if userBucketName != "" {
		log.Debug().Str("userBucketName", userBucketName).Msg("using user provided bucket")
		return userBucketName
	}
	if defaultBucketName == "" {
		log.Warn().Msg("DEKART_CLOUD_STORAGE_BUCKET and userBucketName are not set")
	}
	return defaultBucketName
}

func GetDefaultBucketName() string {
	return os.Getenv("DEKART_CLOUD_STORAGE_BUCKET")
}

// GoogleCloudStorage implements Storage interface for Google Cloud Storage
type GoogleCloudStorage struct {
	defaultBucketName string
	logger            zerolog.Logger
}

func (s GoogleCloudStorage) GetDefaultBucketName() string {
	return s.defaultBucketName
}

func NewGoogleCloudStorage() *GoogleCloudStorage {
	defaultBucketName := os.Getenv("DEKART_CLOUD_STORAGE_BUCKET")
	if defaultBucketName == "" {
		log.Info().Msg("DEKART_CLOUD_STORAGE_BUCKET is not set, using user provided bucket")
	}
	return &GoogleCloudStorage{
		defaultBucketName,
		log.With().Str("DEKART_CLOUD_STORAGE_BUCKET", defaultBucketName).Logger(),
	}
}

func TestConnection(ctx context.Context, source *proto.Source) (*proto.TestConnectionResponse, error) {
	tokenSource := user.GetTokenSource(ctx)
	client, err := storage.NewClient(ctx, option.WithTokenSource(tokenSource))
	if err != nil {
		log.Fatal().Err(err).Send()
	}
	bucket := client.Bucket(source.CloudStorageBucket)
	_, err = bucket.Attrs(ctx)
	if err != nil {
		return &proto.TestConnectionResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}
	return &proto.TestConnectionResponse{
		Success: true,
	}, nil
}

type GetObjectConfig struct {
	bucketName string
}

type GetObjectOption interface {
	apply(*GetObjectConfig)
}

type BucketNameOption struct {
	BucketName string
}

func (o BucketNameOption) apply(options *GetObjectConfig) {
	options.bucketName = o.BucketName
}

func (s GoogleCloudStorage) GetObject(bucketName, object string) StorageObject {
	if bucketName == "" {
		log.Warn().Msg("bucketName is not set")
	}
	return GoogleCloudStorageObject{
		bucketName,
		object,
		s.logger.With().Str("GoogleCloudStorageObject", object).Logger(),
	}
}

// GoogleCloudStorageObject implements StorageObject interface for Google Cloud Storage
type GoogleCloudStorageObject struct {
	bucketName string
	object     string
	logger     zerolog.Logger
}

func (o GoogleCloudStorageObject) CopyFromS3(ctx context.Context, source string) error {
	log.Fatal().Msg("method not implemented")
	return nil
}

func (o GoogleCloudStorageObject) getObject(ctx context.Context) *storage.ObjectHandle {
	tokenSource := user.GetTokenSource(ctx)
	log.Debug().Interface("tokenSource", tokenSource).Msg("getObject tokenSource")
	var client *storage.Client
	var err error
	if tokenSource == nil {
		client, err = storage.NewClient(ctx)
	} else {
		client, err = storage.NewClient(ctx, option.WithTokenSource(tokenSource))
	}
	if err != nil {
		log.Fatal().Err(err).Send()
	}
	bucket := client.Bucket(o.bucketName)
	return bucket.Object(o.object)
}

func (o GoogleCloudStorageObject) GetWriter(ctx context.Context) io.WriteCloser {
	writer := o.getObject(ctx).NewWriter(ctx)
	writer.ChunkSize = 0
	return writer
}

func (o GoogleCloudStorageObject) GetReader(ctx context.Context) (io.ReadCloser, error) {
	return o.getObject(ctx).NewReader(ctx)
}

func (o GoogleCloudStorageObject) GetCreatedAt(ctx context.Context) (*time.Time, error) {
	attrs, err := o.getObject(ctx).Attrs(ctx)
	if err != nil {
		o.logger.Error().Err(err).Msg("error getting attributes")
		return nil, err
	}
	return &attrs.Created, nil
}

func (o GoogleCloudStorageObject) GetSize(ctx context.Context) (*int64, error) {
	attrs, err := o.getObject(ctx).Attrs(ctx)
	if err != nil {
		o.logger.Error().Err(err).Msg("error getting attributes")
		return nil, err
	}
	return &attrs.Size, nil
}

type S3Storage struct {
	bucketName string
	client     *s3.S3
	uploader   *s3manager.Uploader
	logger     zerolog.Logger
}

type S3StorageObject struct {
	S3Storage
	name   string
	logger zerolog.Logger
}

func NewS3Storage() Storage {
	bucketName := os.Getenv("DEKART_CLOUD_STORAGE_BUCKET")
	conf := aws.NewConfig().
		WithMaxRetries(3).
		WithS3ForcePathStyle(true)
	ses := session.Must(session.NewSession(conf))
	s3client := s3.New(ses)
	return S3Storage{
		client:     s3client,
		bucketName: bucketName,
		uploader:   s3manager.NewUploaderWithClient(s3client),
		logger:     log.With().Str("DEKART_CLOUD_STORAGE_BUCKET", bucketName).Logger(),
	}
}

func (s S3Storage) GetDefaultBucketName() string {
	return s.bucketName
}

func (s S3Storage) GetObject(bucketName string, name string) StorageObject {
	return S3StorageObject{
		s,
		name,
		s.logger.With().Str("name", name).Logger(),
	}
}

func (o S3StorageObject) GetWriter(ctx context.Context) io.WriteCloser {
	r, w := io.Pipe()
	errorGroup := &errgroup.Group{}
	errorGroup.Go(func() error {
		_, err := o.uploader.UploadWithContext(ctx,
			&s3manager.UploadInput{
				Bucket: aws.String(o.bucketName),
				Key:    aws.String(o.name),
				Body:   r,
			})
		if err != nil {
			o.logger.Error().Err(err).Msg("error while uploading object")
			return err
		}
		o.logger.Debug().Msg("object is successfully uploaded")
		return nil
	})

	return S3Writer{
		errorGroup,
		w,
		o.logger,
	}
}

func (o S3StorageObject) GetReader(ctx context.Context) (io.ReadCloser, error) {
	output, err := o.client.GetObjectWithContext(ctx, &s3.GetObjectInput{
		Bucket: aws.String(o.bucketName),
		Key:    aws.String(o.name),
	})
	if err != nil {
		o.logger.Error().Err(err).Msg("error while getting object")
		return nil, err
	}
	return output.Body, nil
}

func (o S3StorageObject) GetSize(ctx context.Context) (*int64, error) {
	out, err := o.client.HeadObjectWithContext(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(o.bucketName),
		Key:    aws.String(o.name),
	})
	if err != nil {
		o.logger.Err(err).Msg("error while getting object header")
		return nil, err
	}
	return out.ContentLength, nil
}
func (o S3StorageObject) GetCreatedAt(ctx context.Context) (*time.Time, error) {
	out, err := o.client.HeadObjectWithContext(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(o.bucketName),
		Key:    aws.String(o.name),
	})
	if err != nil {
		o.logger.Err(err).Msg("error while getting object header")
		return nil, err
	}
	return out.LastModified, nil
}

func (o S3StorageObject) CopyFromS3(ctx context.Context, source string) error {
	u, err := url.Parse(source)
	if err != nil {
		o.logger.Error().Str("source", source).Err(err).Msg("Error parsing source URL")
		return err
	}
	copySource := u.Hostname() + u.Path

	_, err = o.client.CopyObjectWithContext(ctx, &s3.CopyObjectInput{
		Bucket:     aws.String(o.bucketName),
		CopySource: aws.String(copySource),
		Key:        aws.String(o.name),
	})
	if err != nil {
		o.logger.Error().Str("source", source).Str("copySource", copySource).Err(err).Msg("Error copying from S3")
	}
	return err
}

type S3Writer struct {
	errorGroup *errgroup.Group
	w          io.WriteCloser
	logger     zerolog.Logger
}

func (w S3Writer) Write(p []byte) (n int, err error) {
	return w.w.Write(p)
}

func (w S3Writer) Close() error {
	// keep sequence closing right writer->pipe.writer->reader->pipe.reader
	if err := w.w.Close(); err != nil {
		w.logger.Err(err).Msg("error closing writer")
		return err
	}

	// wait for upload
	if err := w.errorGroup.Wait(); err != nil {
		w.logger.Err(err).Msg("error uploading")
		return err
	}

	return nil
}
