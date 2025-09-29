package storage

import (
	"context"
	"crypto/tls"
	"dekart/src/proto"
	"dekart/src/server/bqutils"
	"dekart/src/server/conn"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"cloud.google.com/go/storage"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/aws/aws-sdk-go/service/s3/s3manager"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"golang.org/x/sync/errgroup"
	"google.golang.org/api/iterator"
)

type StorageObject interface {
	GetReader(context.Context) (io.ReadCloser, error)
	GetWriter(context.Context) io.WriteCloser
	GetCreatedAt(context.Context) (*time.Time, error)
	GetSize(context.Context) (*int64, error)
	CopyFromS3(ctx context.Context, source string) error
	CopyTo(ctx context.Context, writer io.WriteCloser) error
	Delete(ctx context.Context) error
}

type Storage interface {
	GetObject(context.Context, string, string) StorageObject
	CanSaveQuery(context.Context, string) bool
}

func GetBucketName(userBucketName string) string {
	defaultBucketName := GetDefaultBucketName()
	if userBucketName != "" {
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
	useUserToken      bool // if false ignore user token in ctx and use default service account
}

// CanSaveQuery returns true if the storage can save SQL query text
func (s GoogleCloudStorage) CanSaveQuery(_ context.Context, bucketName string) bool {
	return bucketName != ""
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
		true,
	}
}

// NewPublicStorage used to access public storage bucket with application account
func NewPublicStorage() *GoogleCloudStorage {
	defaultBucketName := os.Getenv("DEKART_CLOUD_PUBLIC_STORAGE_BUCKET")
	if defaultBucketName == "" {
		defaultBucketName = os.Getenv("DEKART_CLOUD_STORAGE_BUCKET")
	}
	if defaultBucketName == "" {
		log.Fatal().Msg("DEKART_CLOUD_PUBLIC_STORAGE_BUCKET and DEKART_CLOUD_STORAGE_BUCKET are not set")
	}
	return &GoogleCloudStorage{
		defaultBucketName,
		log.With().Str("defaultBucketName", defaultBucketName).Logger(),
		false,
	}
}

func TestConnection(ctx context.Context, connection *proto.Connection) (*proto.TestConnectionResponse, error) {
	client, err := bqutils.GetStorageClient(ctx, connection, false)
	if err != nil {
		return &proto.TestConnectionResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}
	bucket := client.Bucket(connection.CloudStorageBucket)

	// Try to list the objects in the bucket
	it := bucket.Objects(ctx, nil)
	_, err = it.Next()
	if err != nil {
		if err == iterator.Done {
			// The bucket is empty, but we have the necessary permission
			return &proto.TestConnectionResponse{
				Success: true,
			}, nil
		}
		// We got an error, so we don't have the necessary permission
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

func (s GoogleCloudStorage) GetObject(_ context.Context, bucketName, object string) StorageObject {
	if bucketName == "" {
		log.Warn().Msg("bucketName is not set")
	}
	return GoogleCloudStorageObject{
		bucketName,
		object,
		s.logger.With().Str("GoogleCloudStorageObject", object).Logger(),
		s.useUserToken,
	}
}

// GoogleCloudStorageObject implements StorageObject interface for Google Cloud Storage
type GoogleCloudStorageObject struct {
	bucketName   string
	object       string
	logger       zerolog.Logger
	useUserToken bool // if false ignore user token in ctx and use default service account
}

func (o GoogleCloudStorageObject) CopyFromS3(ctx context.Context, source string) error {
	log.Fatal().Msg("method not implemented")
	return nil
}

func (o GoogleCloudStorageObject) CopyTo(ctx context.Context, writer io.WriteCloser) error {
	reader, err := o.GetReader(ctx)
	if err != nil {
		log.Err(err).Msg("Error getting reader while copying to Google Cloud Storage")
		return err
	}
	_, err = io.Copy(writer, reader)
	if err != nil {
		log.Err(err).Msg("Error while copying to Google Cloud Storage")
		return err
	}
	err = writer.Close()
	if err != nil {
		log.Err(err).Msg("Error closing writer while copying to Google Cloud Storage")
		return err
	}
	return nil
}

func (o GoogleCloudStorageObject) Delete(ctx context.Context) error {
	obj := o.getObject(ctx)
	err := obj.Delete(ctx)
	if err != nil {
		o.logger.Error().Err(err).Msg("error deleting object")
		return err
	}
	return nil
}

func (o GoogleCloudStorageObject) getObject(ctx context.Context) *storage.ObjectHandle {
	client, err := bqutils.GetStorageClient(ctx, conn.FromCtx(ctx), !o.useUserToken)
	if err != nil {
		log.Err(err).Msg("error getting storage client")
		return nil
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
		o.logger.Error().Stack().Err(err).Msg("error getting attributes")
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

	endpoint := os.Getenv("AWS_ENDPOINT")
	if len(endpoint) > 0 {
		conf = conf.WithEndpoint(endpoint)
	}

	region := os.Getenv("AWS_REGION")
	if len(region) > 0 {
		conf = conf.WithRegion(region)
	}

	insecureTLS := os.Getenv("AWS_INSECURE")
	if strings.ToUpper(insecureTLS) == "TRUE" {
		tr := &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		}
		conf = conf.WithHTTPClient(&http.Client{Transport: tr})
	}

	ses := session.Must(session.NewSession(conf))
	s3client := s3.New(ses)
	return S3Storage{
		client:     s3client,
		bucketName: bucketName,
		uploader:   s3manager.NewUploaderWithClient(s3client),
		logger:     log.With().Str("DEKART_CLOUD_STORAGE_BUCKET", bucketName).Logger(),
	}
}

func (s S3Storage) CanSaveQuery(_ context.Context, bucketName string) bool {
	return bucketName != ""
}

func (s S3Storage) GetDefaultBucketName() string {
	return s.bucketName
}

func (s S3Storage) GetObject(_ context.Context, string, name string) StorageObject {
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

func (s S3StorageObject) CopyTo(ctx context.Context, writer io.WriteCloser) error {
	log.Fatal().Msg("not implemented")
	return nil
}

func (s S3StorageObject) Delete(ctx context.Context) error {
	log.Fatal().Msg("not implemented")
	return nil
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
