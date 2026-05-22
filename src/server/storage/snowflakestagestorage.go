package storage

import (
	"context"
	"database/sql"
	"dekart/src/server/snowflakeutils"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type SnowflakeStageStorage struct {
	UnsupportedUploadSessionStorage
}

func NewSnowflakeStageStorage() *SnowflakeStageStorage {
	return &SnowflakeStageStorage{
		UnsupportedUploadSessionStorage: NewUnsupportedUploadSessionStorage("snowflake-stage"),
	}
}

func (s *SnowflakeStageStorage) CanSaveQuery(context.Context, string) bool {
	return false
}

func (s *SnowflakeStageStorage) GetObject(_ context.Context, stage string, object string) StorageObject {
	return snowflakeStageStorageObject{
		stage:  stage,
		object: object,
	}
}

func (s *SnowflakeStageStorage) ListObjectsByPrefix(ctx context.Context, stage, prefix string) ([]ObjectInfo, error) {
	stageName := strings.TrimSpace(stage)
	if stageName == "" {
		stageName = strings.TrimSpace(os.Getenv("DEKART_SNOWFLAKE_STAGE"))
	}
	if stageName == "" {
		return nil, fmt.Errorf("DEKART_SNOWFLAKE_STAGE is not set")
	}
	db := sql.OpenDB(snowflakeutils.GetConnector(nil))
	defer db.Close()
	rows, err := db.QueryContext(ctx, fmt.Sprintf(`LIST @%s pattern = '.*backup'`, stageName))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	objects := make([]ObjectInfo, 0)
	for rows.Next() {
		var fileName string
		var size int64
		var lastModified string
		var md5 string
		if err := rows.Scan(&fileName, &size, &md5, &lastModified); err != nil {
			continue
		}
		parts := strings.Split(fileName, "/")
		name := parts[len(parts)-1]
		if prefix != "" {
			if idx := strings.Index(fileName, prefix); idx >= 0 {
				name = fileName[idx:]
			} else if !strings.HasPrefix(name, prefix) {
				continue
			}
		}
		t := time.Now().UTC()
		if parsed, err := time.Parse("Mon, 2 Jan 2006 15:04:05 MST", lastModified); err == nil {
			t = parsed.UTC()
		}
		objects = append(objects, ObjectInfo{Name: name, UpdatedAt: t.UTC()})
	}
	return objects, nil
}

type snowflakeStageStorageObject struct {
	stage  string
	object string
}

func (o snowflakeStageStorageObject) GetReader(ctx context.Context) (io.ReadCloser, error) {
	stageName := resolveStageName(o.stage)
	if stageName == "" {
		return nil, fmt.Errorf("DEKART_SNOWFLAKE_STAGE is not set")
	}
	db := sql.OpenDB(snowflakeutils.GetConnector(nil))
	defer db.Close()
	tmpFile, err := os.CreateTemp("", "dekart-sf-stage-read-*")
	if err != nil {
		return nil, err
	}
	tmpPath := tmpFile.Name()
	_ = tmpFile.Close()
	dir := filepath.Dir(tmpPath)
	if _, err := db.ExecContext(ctx, fmt.Sprintf(`GET @%s/%s file://%s`, stageName, o.object, dir)); err != nil {
		_ = os.Remove(tmpPath)
		return nil, err
	}
	downloadedPath := filepath.Join(dir, filepath.Base(o.object))
	if downloadedPath != tmpPath {
		if err := os.Rename(downloadedPath, tmpPath); err != nil {
			_ = os.Remove(downloadedPath)
			_ = os.Remove(tmpPath)
			return nil, err
		}
	}
	f, err := os.Open(tmpPath)
	if err != nil {
		_ = os.Remove(tmpPath)
		return nil, err
	}
	return &removeOnCloseReader{File: f, path: tmpPath}, nil
}

func (o snowflakeStageStorageObject) GetWriter(ctx context.Context) io.WriteCloser {
	stageName := resolveStageName(o.stage)
	if stageName == "" {
		return errorWriteCloser{err: fmt.Errorf("DEKART_SNOWFLAKE_STAGE is not set")}
	}
	tmpDir, err := os.MkdirTemp("", "dekart-sf-stage-write-*")
	if err != nil {
		return errorWriteCloser{err: err}
	}
	fileName := filepath.Base(o.object)
	if fileName == "." || fileName == string(filepath.Separator) || fileName == "" {
		fileName = "upload.backup"
	}
	tmpPath := filepath.Join(tmpDir, fileName)
	tmpFile, err := os.Create(tmpPath)
	if err != nil {
		_ = os.RemoveAll(tmpDir)
		return errorWriteCloser{err: err}
	}
	return &snowflakeStageWriter{
		ctx:       ctx,
		stageName: stageName,
		object:    o.object,
		path:      tmpPath,
		tmpDir:    tmpDir,
		file:      tmpFile,
	}
}

func (o snowflakeStageStorageObject) GetCreatedAt(context.Context) (*time.Time, error) {
	return nil, fmt.Errorf("GetCreatedAt is not supported for Snowflake stage object")
}

func (o snowflakeStageStorageObject) GetSize(context.Context) (*int64, error) {
	return nil, fmt.Errorf("GetSize is not supported for Snowflake stage object")
}

func (o snowflakeStageStorageObject) CopyFromS3(context.Context, string) error {
	return fmt.Errorf("CopyFromS3 is not supported for Snowflake stage object")
}

func (o snowflakeStageStorageObject) CopyTo(context.Context, io.WriteCloser) error {
	return fmt.Errorf("CopyTo is not supported for Snowflake stage object")
}

func (o snowflakeStageStorageObject) Delete(ctx context.Context) error {
	stageName := resolveStageName(o.stage)
	if stageName == "" {
		return fmt.Errorf("DEKART_SNOWFLAKE_STAGE is not set")
	}
	db := sql.OpenDB(snowflakeutils.GetConnector(nil))
	defer db.Close()
	_, err := db.ExecContext(ctx, fmt.Sprintf(`REMOVE @%s/%s`, stageName, o.object))
	return err
}

func resolveStageName(stage string) string {
	stageName := strings.TrimSpace(stage)
	if stageName == "" {
		stageName = strings.TrimSpace(os.Getenv("DEKART_SNOWFLAKE_STAGE"))
	}
	return stageName
}

type removeOnCloseReader struct {
	*os.File
	path string
}

func (r *removeOnCloseReader) Close() error {
	err := r.File.Close()
	_ = os.Remove(r.path)
	return err
}

type snowflakeStageWriter struct {
	ctx       context.Context
	stageName string
	object    string
	path      string
	tmpDir    string
	file      *os.File
	closed    bool
}

func (w *snowflakeStageWriter) Write(p []byte) (int, error) {
	return w.file.Write(p)
}

func (w *snowflakeStageWriter) Close() error {
	if w.closed {
		return nil
	}
	w.closed = true
	if err := w.file.Close(); err != nil {
		_ = os.RemoveAll(w.tmpDir)
		return err
	}
	db := sql.OpenDB(snowflakeutils.GetConnector(nil))
	defer db.Close()
	target := ""
	if w.object != "" {
		objectDir := strings.Trim(filepath.Dir(w.object), "/")
		if objectDir != "." && objectDir != "" {
			target = "/" + objectDir
		}
	}
	_, err := db.ExecContext(w.ctx, fmt.Sprintf(`PUT 'file://%s' @%s%s auto_compress=false`, w.path, w.stageName, target))
	_ = os.RemoveAll(w.tmpDir)
	return err
}
