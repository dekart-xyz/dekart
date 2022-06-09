package blobstorage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/url"
	"path/filepath"
	"strings"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/aws/aws-sdk-go/service/s3/s3manager"
	"github.com/rs/zerolog/log"
	"golang.org/x/sync/errgroup"
)

func New(bucket string, s3client *s3.S3) *Storage {
	return &Storage{
		client:     s3client,
		bucket:     bucket,
		uploader:   s3manager.NewUploaderWithClient(s3client),
		downloader: s3manager.NewDownloaderWithClient(s3client),
	}
}

type Storage struct {
	client     *s3.S3
	uploader   *s3manager.Uploader
	downloader *s3manager.Downloader
	bucket     string
}

func (bs *Storage) Writer(ctx context.Context, key string) io.WriteCloser {
	key = strings.TrimLeft(key, "/")

	pr, pw := io.Pipe()

	wrtr := &s3Writer{
		fileName: bs.bucket + "/" + key,
		w:        pw,
		gr:       &errgroup.Group{},
	}

	wrtr.gr.Go(
		func() error {
			_, err := bs.uploader.UploadWithContext(ctx,
				&s3manager.UploadInput{
					Bucket: aws.String(bs.bucket),
					Key:    aws.String(key),
					Body:   pr,
				})

			return err
		},
	)

	return wrtr
}

type s3Writer struct {
	fileName string

	w  io.WriteCloser
	gr *errgroup.Group
}

func (w *s3Writer) Write(p []byte) (n int, err error) {
	return w.w.Write(p)
}

func (w *s3Writer) Close() error {
	// keep sequence closing right writer->pipe.writer->reader->pipe.reader
	if err := w.w.Close(); err != nil {
		return fmt.Errorf("s3writer: %s uploading: pipe writer: %w", w.fileName, err)
	}

	// wait for upload
	if err := w.gr.Wait(); err != nil {
		return fmt.Errorf("s3writer: %s uploading: %w", w.fileName, err)
	}

	return nil
}

func (bs *Storage) Reader(ctx context.Context, key string) (io.Reader, error) {

	buf := aws.NewWriteAtBuffer(make([]byte, 0, 60_000_000))

	_, err := bs.downloader.DownloadWithContext(ctx, buf, &s3.GetObjectInput{
		Bucket: aws.String(bs.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, fmt.Errorf("could not download s3 object: %w", err)
	}

	log.Info().Msgf("Download completed s3://" + filepath.Join(bs.bucket, key))

	return bytes.NewReader(buf.Bytes()), nil
}

func (bs *Storage) GetObjectMetadata(ctx context.Context, key string) (*s3.HeadObjectOutput, error) {
	out, err := bs.client.HeadObjectWithContext(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(bs.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, fmt.Errorf("could not head s3 bucket %s key %s : %w", bs.bucket, key, err)
	}

	return out, nil
}

func (bs *Storage) CopyObject(ctx context.Context, srcKeyFullPath, dstKey string) error {
	_, err := bs.client.CopyObjectWithContext(ctx, &s3.CopyObjectInput{
		Bucket:     aws.String(bs.bucket),
		CopySource: aws.String(url.PathEscape(srcKeyFullPath[5:])),
		Key:        aws.String(dstKey),
	})
	if err != nil {
		return fmt.Errorf("could not copy s3 object: %w", err)
	}

	err = bs.client.WaitUntilObjectExistsWithContext(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(bs.bucket),
		Key:    aws.String(dstKey),
	})

	if err != nil {
		return fmt.Errorf("could not wait for s3 object: %w", err)
	}

	return nil
}
