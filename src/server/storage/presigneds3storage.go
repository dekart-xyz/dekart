// ./src/server/storage/presigneds3storage.go
package storage

import (
	"bytes"
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"dekart/src/server/errtype"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"golang.org/x/sync/errgroup"
)

type PresignedS3Storage struct{}

func NewPresignedS3Storage() Storage { return PresignedS3Storage{} }

func (s PresignedS3Storage) CanSaveQuery(context.Context, string) bool { return false }

func (s PresignedS3Storage) GetObject(_ context.Context, _ string, signedURL string) StorageObject {
	return PresignedS3Object{
		url:    signedURL,
		logger: log.With().Str("presignedS3URL", signedURL).Logger(),
	}
}

func NewPresignedS3Object(signedURL string) StorageObject {
	return PresignedS3Object{
		url:    signedURL,
		logger: log.With().Str("presignedS3URL", signedURL).Logger(),
	}
}

type PresignedS3Object struct {
	url    string
	logger zerolog.Logger
}

func (o PresignedS3Object) GetReader(ctx context.Context) (io.ReadCloser, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, o.url, nil)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		o.logger.Error().Err(err).Msg("GET request failed")
		return nil, err
	}

	switch resp.StatusCode {
	case http.StatusOK:
		return resp.Body, nil
	case http.StatusForbidden, http.StatusGone, http.StatusNotFound, http.StatusBadRequest:
		expired, decErr := decodeS3Error(resp)
		if expired {
			return nil, &errtype.Expired{}
		}
		return nil, decErr // ordinary failure
	default:
		_ = resp.Body.Close()
		return nil, fmt.Errorf("presigned-s3 GET: unexpected HTTP status %d %s", resp.StatusCode, resp.Status)
	}
}

// decodeS3Error inspects the HTTP status plus the XML error document.
// Returns (expired, err)
func decodeS3Error(resp *http.Response) (bool, error) {
	// Read the body (it's small XML, so slurp it)
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return false, err
	}

	type s3Err struct {
		Code    string `xml:"Code"`
		Message string `xml:"Message"`
	}
	var e s3Err
	if xmlErr := xml.Unmarshal(b, &e); xmlErr != nil {
		// fall back on plain text search
		if bytes.Contains(b, []byte("Request has expired")) {
			return true, nil
		}
		return false, fmt.Errorf("s3 error: %s", bytes.TrimSpace(b))
	}

	switch e.Code {
	case "ExpiredToken", "RequestTimeTooSkewed":
		return true, nil
	case "AccessDenied":
		if strings.Contains(strings.ToLower(e.Message), "expired") {
			return true, nil
		}
	}

	return false, fmt.Errorf("s3 error %s: %s", e.Code, e.Message)
}

// ─── WRITE ────────────────────────────────────────────────────────────────────
// We stream via an io.Pipe so callers can write incrementally.

func (o PresignedS3Object) GetWriter(ctx context.Context) io.WriteCloser {
	pr, pw := io.Pipe()
	eg := new(errgroup.Group)

	eg.Go(func() error {
		req, _ := http.NewRequestWithContext(ctx, http.MethodPut, o.url, pr)
		req.Header.Set("Content-Type", "application/octet-stream")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			o.logger.Error().Err(err).Msg("PUT request failed")
			return err
		}
		defer resp.Body.Close()

		switch resp.StatusCode {
		case http.StatusOK, http.StatusCreated, http.StatusNoContent:
			return nil
		case http.StatusForbidden, http.StatusGone, http.StatusNotFound, http.StatusBadRequest:
			expired, decErr := decodeS3Error(resp)
			if expired {
				return &errtype.Expired{}
			}
			return decErr // ordinary failure
		default:
			return fmt.Errorf("presigned-s3 PUT: unexpected HTTP status %d %s", resp.StatusCode, resp.Status)
		}
	})

	return presignedWriter{pw: pw, eg: eg, logger: o.logger}
}

type presignedWriter struct {
	pw     *io.PipeWriter
	eg     *errgroup.Group
	logger zerolog.Logger
}

func (w presignedWriter) Write(p []byte) (int, error) { return w.pw.Write(p) }

func (w presignedWriter) Close() error {
	if err := w.pw.Close(); err != nil {
		return err
	}
	return w.eg.Wait()
}

// ─── METADATA (HEAD) ──────────────────────────────────────────────────────────

func (o PresignedS3Object) head(ctx context.Context) (*http.Response, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodHead, o.url, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}

	switch resp.StatusCode {
	case http.StatusOK:
		return resp, nil
	case http.StatusForbidden, http.StatusGone, http.StatusNotFound, http.StatusBadRequest:
		expired, decErr := decodeS3Error(resp)
		if expired {
			return nil, &errtype.Expired{}
		}
		return nil, decErr
	default:
		_ = resp.Body.Close()
		return nil, fmt.Errorf("presigned-s3 HEAD: unexpected HTTP status %s", resp.Status)
	}
}

func (o PresignedS3Object) GetCreatedAt(ctx context.Context) (*time.Time, error) {
	now := time.Now()
	return &now, nil
}

func (o PresignedS3Object) GetSize(ctx context.Context) (*int64, error) {
	resp, err := o.head(ctx)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if cl := resp.Header.Get("Content-Length"); cl != "" {
		if n, err := strconv.ParseInt(cl, 10, 64); err == nil {
			return &n, nil
		}
	}
	return nil, nil
}

// ─── COPY / DELETE helpers ───────────────────────────────────────────────────

func (o PresignedS3Object) CopyFromS3(context.Context, string) error {
	// A pre-signed target can’t use server-side COPY – caller must stream.
	return fmt.Errorf("CopyFromS3 not supported for presigned S3 URLs")
}

func (o PresignedS3Object) CopyTo(ctx context.Context, w io.WriteCloser) error {
	r, err := o.GetReader(ctx)
	if err != nil {
		return err
	}
	if _, err = io.Copy(w, r); err != nil {
		return err
	}
	_ = r.Close()
	return w.Close()
}

func (o PresignedS3Object) Delete(ctx context.Context) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodDelete, o.url, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK, http.StatusNoContent:
		return nil
	case http.StatusForbidden, http.StatusGone, http.StatusNotFound, http.StatusBadRequest:
		expired, decErr := decodeS3Error(resp)
		if expired {
			return &errtype.Expired{}
		}
		return decErr // ordinary failure
	default:
		return fmt.Errorf("presigned-s3 DELETE: unexpected HTTP status %s", resp.Status)
	}
}
