package storage

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type LocalFSStorageObject struct {
	rootDir string
	object  string
}

func NewLocalFSStorageObject(rootDir string, object string) LocalFSStorageObject {
	return LocalFSStorageObject{
		rootDir: rootDir,
		object:  object,
	}
}

func localFSResolvePath(rootDir string, object string) (string, error) {
	name := strings.TrimSpace(object)
	if name == "" {
		return "", fmt.Errorf("object name is required")
	}
	clean := filepath.Clean(name)
	if clean == "." || clean == ".." {
		return "", fmt.Errorf("invalid object name")
	}
	if strings.Contains(clean, ".."+string(os.PathSeparator)) {
		return "", fmt.Errorf("invalid object name")
	}
	if filepath.IsAbs(clean) {
		return "", fmt.Errorf("absolute object path is not allowed")
	}
	// Uploaded objects are stored by generated file ids and must stay in root.
	if strings.Contains(clean, string(os.PathSeparator)) {
		return "", fmt.Errorf("nested object path is not allowed")
	}
	return filepath.Join(rootDir, clean), nil
}

func (o LocalFSStorageObject) GetReader(_ context.Context) (io.ReadCloser, error) {
	path, err := localFSResolvePath(o.rootDir, o.object)
	if err != nil {
		return nil, err
	}
	return os.Open(path)
}

func (o LocalFSStorageObject) GetWriter(_ context.Context) io.WriteCloser {
	path, err := localFSResolvePath(o.rootDir, o.object)
	if err != nil {
		return errorWriteCloser{err: err}
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return errorWriteCloser{err: err}
	}
	file, err := os.Create(path)
	if err != nil {
		return errorWriteCloser{err: err}
	}
	return file
}

func (o LocalFSStorageObject) GetCreatedAt(_ context.Context) (*time.Time, error) {
	path, err := localFSResolvePath(o.rootDir, o.object)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	ts := info.ModTime().UTC()
	return &ts, nil
}

func (o LocalFSStorageObject) GetSize(_ context.Context) (*int64, error) {
	path, err := localFSResolvePath(o.rootDir, o.object)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	size := info.Size()
	return &size, nil
}

func (o LocalFSStorageObject) CopyFromS3(_ context.Context, _ string) error {
	return fmt.Errorf("copy from s3 is not supported for localfs storage")
}

func (o LocalFSStorageObject) CopyTo(ctx context.Context, writer io.WriteCloser) error {
	reader, err := o.GetReader(ctx)
	if err != nil {
		return err
	}
	defer reader.Close()
	_, err = io.Copy(writer, reader)
	if err != nil {
		return err
	}
	return writer.Close()
}

func (o LocalFSStorageObject) Delete(_ context.Context) error {
	path, err := localFSResolvePath(o.rootDir, o.object)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
