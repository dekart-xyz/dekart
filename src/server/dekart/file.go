package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/conn"
	"dekart/src/server/errtype"
	"dekart/src/server/storage"
	"dekart/src/server/user"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"time"

	"github.com/dustin/go-humanize"
	"github.com/gorilla/mux"
	"github.com/lib/pq"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// parseFileSizeLimit parses file size strings with units using go-humanize library
// Supports various formats like "32MB", "100KB", "1GB", "50000000" (bytes)
// Returns size in bytes
func parseFileSizeLimit(sizeStr string) (int64, error) {
	if sizeStr == "" {
		return 0, fmt.Errorf("empty size string")
	}

	size, err := humanize.ParseBytes(sizeStr)
	if err != nil {
		return 0, fmt.Errorf("invalid size format: %s (expected format: '32MB', '100KB', '1GB', or bytes)", sizeStr)
	}

	return int64(size), nil
}

// getMaxFileUploadSize reads DEKART_MAX_FILE_UPLOAD_SIZE env var and returns size in bytes
// Defaults to 32MB (32000000 bytes) if not set or invalid
func getMaxFileUploadSize() int64 {
	const defaultSize = 32 * 1000 * 1000 // 32MB (decimal)
	sizeStr := os.Getenv("DEKART_MAX_FILE_UPLOAD_SIZE")

	if sizeStr == "" {
		return defaultSize
	}

	size, err := parseFileSizeLimit(sizeStr)
	if err != nil {
		log.Fatal().Err(err).Str("DEKART_MAX_FILE_UPLOAD_SIZE", sizeStr).Msg("Invalid DEKART_MAX_FILE_UPLOAD_SIZE")
	}

	return size
}

func (s Server) getFileReports(ctx context.Context, fileId string) (*string, error) {
	fileRows, err := s.db.QueryContext(ctx,
		`select
			reports.id
		from files
			left join datasets on files.id = datasets.file_id
			left join reports on datasets.report_id = reports.id
		where files.id = $1`,
		fileId,
	)
	if err != nil {
		return nil, err
	}
	defer fileRows.Close()
	var reportId string
	for fileRows.Next() {
		if err = fileRows.Scan(&reportId); err != nil {
			return nil, err
		}
	}
	if reportId == "" {
		return nil, nil
	}
	return &reportId, nil
}

func (s Server) setUploadError(reportID string, fileSourceID string, err error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err = s.db.ExecContext(
		ctx,
		`update files set upload_error=$1, updated_at=CURRENT_TIMESTAMP where file_source_id=$2`,
		err.Error(),
		fileSourceID,
	)
	if err != nil {
		errtype.LogError(err, "setUploadError failed")
		return
	}
	s.reportStreams.Ping(reportID)
}

func (s Server) moveFileToStorage(reqConCtx context.Context, fileSourceID string, fileExtension string, file multipart.File, report *proto.Report, bucketName string) {
	defer file.Close()
	userCtx, cancel := context.WithTimeout(user.CopyUserContext(reqConCtx, context.Background()), 10*time.Minute)
	userConnCtx := conn.CopyConnectionCtx(reqConCtx, userCtx)
	defConnCtx := conn.GetCtx(userCtx, &proto.Connection{})
	defer cancel()
	var storageWriter io.WriteCloser
	if report.IsPublic {
		pubStorage := storage.NewPublicStorage()
		storageWriter = pubStorage.GetObject(defConnCtx, pubStorage.GetDefaultBucketName(), fmt.Sprintf("%s.%s", fileSourceID, fileExtension)).GetWriter(defConnCtx)
	} else {
		// reqConCtx is used because it has connection information, userCtx does not have it
		storageWriter = s.storage.GetObject(userConnCtx, bucketName, fmt.Sprintf("%s.%s", fileSourceID, fileExtension)).GetWriter(userConnCtx)
	}
	_, err := io.Copy(storageWriter, file)
	if err != nil {
		errtype.LogError(err, "error copying file to storage")
		s.setUploadError(report.Id, fileSourceID, err)
		return
	}

	err = storageWriter.Close()
	if err != nil {
		errtype.LogError(err, "error closing storage writer")
		s.setUploadError(report.Id, fileSourceID, err)
		return
	}
	_, err = s.db.ExecContext(userCtx,
		`update files set file_status=3, updated_at=CURRENT_TIMESTAMP where file_source_id=$1`,
		fileSourceID,
	)
	if err != nil {
		errtype.LogError(err, "update file status failed")
		s.setUploadError(report.Id, fileSourceID, err)
		return
	}
	s.reportStreams.Ping(report.Id)
}

func (s Server) UploadFile(w http.ResponseWriter, r *http.Request) {
	if len(os.Getenv("DEKART_ALLOW_FILE_UPLOAD")) == 0 {
		log.Warn().Msg("file upload is disabled, set DEKART_ALLOW_FILE_UPLOAD to enable")
		w.WriteHeader(http.StatusForbidden)
		return
	}
	fileId := mux.Vars(r)["id"]
	ctx := r.Context()
	claims := user.GetClaims(ctx)
	if claims == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	reportId, err := s.getFileReports(ctx, fileId)

	if err != nil {
		errtype.LogError(err, "getFileReports failed")
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}

	if reportId == nil {
		err := fmt.Errorf("file not found")
		log.Warn().Err(err).Msg("file not found")
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	report, err := s.getReport(ctx, *reportId)
	if err != nil {
		errtype.LogError(err, "getReport failed")
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if report == nil || !report.CanWrite {
		err := fmt.Errorf("report not found or permission not granted")
		log.Warn().Err(err).Msg("report not found or permission not granted")
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	connection, err := s.getConnectionFromFileID(ctx, fileId)

	if err != nil {
		errtype.LogError(err, "getConnectionFromFileID failed")
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if connection == nil {
		err = fmt.Errorf("connection not found")
		errtype.LogError(err, "connection not found")
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	if !connection.CanStoreFiles {
		err = fmt.Errorf("connection does not support file storage")
		log.Warn().Err(err).Msg("connection does not support file storage")
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	bucketName := s.getBucketNameFromConnection(connection)

	file, handler, err := r.FormFile("file")
	if err != nil {
		errtype.LogError(err, "FormFile failed")
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Check file size limit
	maxSize := getMaxFileUploadSize()
	if handler.Size > maxSize {
		err = fmt.Errorf("file size (%s) exceeds maximum allowed size of %s",
			humanize.Bytes(uint64(handler.Size)),
			humanize.Bytes(uint64(maxSize)))
		log.Warn().Err(err).Int64("fileSize", handler.Size).Int64("maxSize", maxSize).Msg("file size exceeds limit")
		http.Error(w, err.Error(), http.StatusRequestEntityTooLarge)
		file.Close()
		return
	}

	mimeType := handler.Header.Get("Content-Type")

	fileExtension := getFileExtensionFromMime(mimeType)

	if fileExtension == "" {
		err = fmt.Errorf("unsupported file type")
		log.Warn().Err(err).Str("mimeType", mimeType).Msg("unsupported file type")
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	fileSourceID := newUUID()

	_, err = s.db.ExecContext(ctx,
		`update files set name=$1, size=$2, mime_type=$3, file_status=2, file_source_id=$4, updated_at=CURRENT_TIMESTAMP where id=$5`,
		handler.Filename,
		handler.Size,
		mimeType,
		fileSourceID,
		fileId,
	)
	if err != nil {
		errtype.LogError(err, "update files failed")
		http.Error(w, err.Error(), http.StatusInternalServerError)
		file.Close()
		return
	}
	conCtx := conn.GetCtx(ctx, connection)
	go s.moveFileToStorage(conCtx, fileSourceID, fileExtension, file, report, bucketName)
	s.reportStreams.Ping(*reportId)

}

func (s Server) CreateFile(ctx context.Context, req *proto.CreateFileRequest) (*proto.CreateFileResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}

	reportID, err := s.getReportID(ctx, req.DatasetId, true)

	if err != nil {
		errtype.LogError(err, "getReportID failed")
		return nil, status.Error(codes.Internal, err.Error())
	}

	if reportID == nil {
		err := fmt.Errorf("dataset not found or permission not granted")
		log.Warn().Err(err).Msg("dataset not found or permission not granted")
		return nil, status.Error(codes.NotFound, err.Error())
	}

	id := newUUID()

	_, err = s.db.ExecContext(ctx,
		`insert into files (id) values ($1)`,
		id,
	)
	if err != nil {
		errtype.LogError(err, "insert into files failed")
		return nil, status.Error(codes.Internal, err.Error())
	}

	result, err := s.db.ExecContext(ctx,
		`update datasets set file_id=$1, connection_id=$2, updated_at=CURRENT_TIMESTAMP where id=$3 and file_id is null`,
		id,
		conn.ConnectionIDToNullString(req.ConnectionId),
		req.DatasetId,
	)
	if err != nil {
		log.Err(err).Str("connectionId", req.ConnectionId).Msg("update datasets failed when creating file")
		return nil, status.Error(codes.Internal, err.Error())
	}

	affectedRows, err := result.RowsAffected()
	if err != nil {
		errtype.LogError(err, "RowsAffected failed when creating file")
		return nil, status.Error(codes.Internal, err.Error())
	}

	if affectedRows == 0 {
		log.Warn().Str("report", *reportID).Str("dataset", req.DatasetId).Msg("dataset file was already created")
	}

	s.reportStreams.Ping(*reportID)

	return &proto.CreateFileResponse{}, nil
}

func (s Server) getFiles(ctx context.Context, datasets []*proto.Dataset) ([]*proto.File, error) {
	files := make([]*proto.File, 0)
	fileIds := make([]string, 0)
	for _, dataset := range datasets {
		if dataset.FileId != "" {
			fileIds = append(fileIds, dataset.FileId)
		}
	}

	if len(fileIds) > 0 {
		fileRows, err := s.db.QueryContext(ctx,
			`select
				id,
				name,
				size,
				mime_type,
				file_status,
				file_source_id,
				upload_error,
				created_at,
				updated_at
			from files where id = ANY($1) order by created_at asc`,
			pq.Array(fileIds),
		)
		if err != nil {
			errtype.LogError(err, "select from files failed")
			return nil, err
		}
		defer fileRows.Close()
		for fileRows.Next() {
			file := proto.File{}

			var fileSourceID sql.NullString
			var createdAt time.Time
			var updatedAt time.Time

			if err = fileRows.Scan(
				&file.Id,
				&file.Name,
				&file.Size,
				&file.MimeType,
				&file.FileStatus,
				&fileSourceID,
				&file.UploadError,
				&createdAt,
				&updatedAt,
			); err != nil {
				errtype.LogError(err, "scan file list failed")
				return nil, err
			}
			file.SourceId = fileSourceID.String
			file.CreatedAt = createdAt.Unix()
			file.UpdatedAt = updatedAt.Unix()
			files = append(files, &file)
		}
	}

	return files, nil
}
