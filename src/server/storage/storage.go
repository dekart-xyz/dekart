package storage

import (
	"context"
	"crypto/tls"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/aws/aws-sdk-go/service/s3/s3manager"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"golang.org/x/sync/errgroup"
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
	StartUploadSession(context.Context, StartUploadSessionInput) (*StartUploadSessionOutput, error)
	GetUploadPart(context.Context, GetUploadPartInput) (*GetUploadPartOutput, error)
	CompleteUploadSession(context.Context, CompleteUploadSessionInput) (*CompleteUploadSessionOutput, error)
	AbortUploadSession(context.Context, AbortUploadSessionInput) error
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

type S3Storage struct {
	UnsupportedUploadSessionStorage
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
		UnsupportedUploadSessionStorage: NewUnsupportedUploadSessionStorage("s3"),
		client:                          s3client,
		bucketName:                      bucketName,
		uploader:                        s3manager.NewUploaderWithClient(s3client),
		logger:                          log.With().Str("DEKART_CLOUD_STORAGE_BUCKET", bucketName).Logger(),
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
