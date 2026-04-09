package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/storage"
	"dekart/src/server/user"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

type fileUploadSessionContext struct {
	reportID     string
	connection   *proto.Connection
	bucketName   string
	fileSourceID string
	mimeType     string
}

func (s Server) requireFileUploadSessionContext(ctx context.Context, fileID string) (*fileUploadSessionContext, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	reportID, err := s.getFileReports(ctx, fileID)
	if err != nil {
		return nil, err
	}
	if reportID == nil {
		return nil, sql.ErrNoRows
	}
	report, err := s.getReport(ctx, *reportID)
	if err != nil {
		return nil, err
	}
	if report == nil || !report.CanWrite {
		return nil, sql.ErrNoRows
	}
	connection, err := s.getConnectionFromFileID(ctx, fileID)
	if err != nil {
		return nil, err
	}
	if connection == nil || !connection.CanStoreFiles {
		return nil, fmt.Errorf("connection does not support file storage")
	}
	fileSourceID, mimeType, err := s.getFileUploadState(ctx, fileID)
	if err != nil {
		return nil, err
	}
	return &fileUploadSessionContext{
		reportID:     *reportID,
		connection:   connection,
		bucketName:   s.getBucketNameFromConnection(connection),
		fileSourceID: fileSourceID,
		mimeType:     mimeType,
	}, nil
}

func (s Server) getFileUploadState(ctx context.Context, fileID string) (string, string, error) {
	var fileSourceID, mimeType sql.NullString
	err := s.db.QueryRowContext(ctx, `select file_source_id, mime_type from files where id=$1`, fileID).Scan(&fileSourceID, &mimeType)
	if err != nil {
		return "", "", err
	}
	return fileSourceID.String, mimeType.String, nil
}

func (s Server) markFileUploadStarted(ctx context.Context, fileID, fileSourceID string, req *proto.CreateFileUploadSessionRequest) error {
	_, err := s.db.ExecContext(
		ctx,
		`update files set name=$1, size=$2, mime_type=$3, file_status=2, file_source_id=$4, upload_error='', updated_at=CURRENT_TIMESTAMP where id=$5`,
		req.GetName(), req.GetTotalSize(), req.GetMimeType(), fileSourceID, fileID,
	)
	return err
}

func (s Server) markFileUploadCompleted(ctx context.Context, fileID string, size int64) error {
	_, err := s.db.ExecContext(
		ctx,
		`update files set size=$1, file_status=3, upload_error='', updated_at=CURRENT_TIMESTAMP where id=$2`,
		size, fileID,
	)
	return err
}

func (s Server) getFileStatusAndSize(ctx context.Context, fileID string) (int64, int64, error) {
	var status, size sql.NullInt64
	err := s.db.QueryRowContext(ctx, `select file_status, size from files where id=$1`, fileID).Scan(&status, &size)
	if err != nil {
		return 0, 0, err
	}
	return status.Int64, size.Int64, nil
}

func convertUploadHeadersToProto(headers []storage.UploadHeader) []*proto.UploadHeader {
	result := make([]*proto.UploadHeader, 0, len(headers))
	for _, h := range headers {
		result = append(result, &proto.UploadHeader{Key: h.Key, Value: h.Value})
	}
	return result
}

func buildFileObjectName(fileSourceID, mimeType string) (string, error) {
	if strings.TrimSpace(fileSourceID) == "" {
		return "", fmt.Errorf("file_source_id is missing")
	}
	fileExtension := getFileExtensionFromMime(mimeType)
	if fileExtension == "" {
		return "", fmt.Errorf("unsupported file type")
	}
	return fmt.Sprintf("%s.%s", fileSourceID, fileExtension), nil
}

func parsePositiveInt64(raw string) (int64, error) {
	value, err := strconv.ParseInt(strings.TrimSpace(raw), 10, 64)
	if err != nil || value <= 0 {
		return 0, fmt.Errorf("invalid positive int")
	}
	return value, nil
}

func handleFileUploadSessionError(w http.ResponseWriter, err error) {
	if err == nil {
		return
	}
	if err == Unauthenticated {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if err == sql.ErrNoRows {
		http.Error(w, "file not found", http.StatusNotFound)
		return
	}
	http.Error(w, err.Error(), http.StatusBadRequest)
}

func isFileUploadEnabled() bool {
	return os.Getenv("DEKART_ALLOW_FILE_UPLOAD") != ""
}

func nowUTC() time.Time {
	return time.Now().UTC()
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
