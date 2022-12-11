package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/user"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"time"

	"github.com/gorilla/mux"
	"github.com/lib/pq"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (s Server) getFileReports(ctx context.Context, fileId string, claims *user.Claims) ([]string, error) {
	fileRows, err := s.db.QueryContext(ctx,
		`select 
			reports.id
		from files
			left join datasets on files.id = datasets.file_id
			left join reports on datasets.report_id = reports.id
		where files.id = $1 and author_email = $2`,
		fileId,
		claims.Email,
	)
	if err != nil {
		return nil, err
	}
	defer fileRows.Close()
	reportIds := make([]string, 0)
	for fileRows.Next() {
		var reportId string
		if err = fileRows.Scan(&reportId); err != nil {
			return nil, err
		}
		reportIds = append(reportIds, reportId)
	}
	return reportIds, nil
}

func (s Server) setUploadError(reportIDs []string, fileSourceID string, err error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err = s.db.ExecContext(
		ctx,
		`update files set upload_error=$1 where file_source_id=$2`,
		err.Error(),
		fileSourceID,
	)
	if err != nil {
		log.Err(err).Send()
		return
	}
	s.reportStreams.PingAll(reportIDs)
}

func getFileExtension(mimeType string) string {
	switch mimeType {
	case "text/csv":
		return "csv"
	case "application/geo+json":
		return "geojson"
	default:
		return ""
	}
}

func (s Server) moveFileToStorage(fileSourceID string, fileExtension string, file multipart.File, reportIDs []string) {
	defer file.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	storageWriter := s.storage.GetObject(fmt.Sprintf("%s.%s", fileSourceID, fileExtension)).GetWriter(ctx)
	_, err := io.Copy(storageWriter, file)
	if err != nil {
		log.Err(err).Send()
		s.setUploadError(reportIDs, fileSourceID, err)
		return
	}

	err = storageWriter.Close()
	if err != nil {
		log.Err(err).Send()
		s.setUploadError(reportIDs, fileSourceID, err)
	}
	log.Debug().Msgf("file %s.csv moved to storage", fileSourceID)
	_, err = s.db.ExecContext(ctx,
		`update files set file_status=3 where file_source_id=$1`,
		fileSourceID,
	)
	if err != nil {
		log.Err(err).Send()
		s.setUploadError(reportIDs, fileSourceID, err)
		return
	}
	s.reportStreams.PingAll(reportIDs)
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
	}
	reportIds, err := s.getFileReports(ctx, fileId, claims)

	if err != nil {
		log.Err(err).Send()
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}

	if len(reportIds) == 0 {
		err = fmt.Errorf("file not found or permission not granted")
		log.Err(err).Send()
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	file, handler, err := r.FormFile("file")
	if err != nil {
		log.Err(err).Send()
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	mimeType := handler.Header.Get("Content-Type")

	fileExtension := getFileExtension(mimeType)

	if fileExtension == "" {
		err = fmt.Errorf("unsupported file type")
		log.Warn().Err(err).Str("mimeType", mimeType).Send()
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	fileSourceID := newUUID()

	_, err = s.db.ExecContext(ctx,
		`update files set name=$1, size=$2, mime_type=$3, file_status=2, file_source_id=$4 where id=$5`,
		handler.Filename,
		handler.Size,
		mimeType,
		fileSourceID,
		fileId,
	)
	if err != nil {
		log.Err(err).Send()
		http.Error(w, err.Error(), http.StatusInternalServerError)
		file.Close()
		return
	}
	go s.moveFileToStorage(fileSourceID, fileExtension, file, reportIds)
	s.reportStreams.PingAll(reportIds)

}

func (s Server) CreateFile(ctx context.Context, req *proto.CreateFileRequest) (*proto.CreateFileResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}

	reportID, err := s.getReportID(ctx, req.DatasetId, claims.Email)

	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	if reportID == nil {
		err := fmt.Errorf("dataset not found or permission not granted")
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}

	id := newUUID()

	_, err = s.db.ExecContext(ctx,
		`insert into files (id) values ($1)`,
		id,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	result, err := s.db.ExecContext(ctx,
		`update datasets set file_id=$1 where id=$2 and file_id is null`,
		id,
		req.DatasetId,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	affectedRows, err := result.RowsAffected()
	if err != nil {
		log.Err(err).Send()
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
			log.Error().Err(err).Msg("select from files failed")
			return nil, err
		}
		defer fileRows.Close()
		for fileRows.Next() {
			file := proto.File{}

			var sourceId sql.NullString
			var createdAt time.Time
			var updatedAt time.Time

			if err = fileRows.Scan(
				&file.Id,
				&file.Name,
				&file.Size,
				&file.MimeType,
				&file.FileStatus,
				&sourceId,
				&file.UploadError,
				&createdAt,
				&updatedAt,
			); err != nil {
				log.Error().Err(err).Msg("scan file list failed")
				return nil, err
			}
			file.SourceId = sourceId.String
			file.CreatedAt = createdAt.Unix()
			file.UpdatedAt = updatedAt.Unix()
			files = append(files, &file)
		}
	}

	return files, nil
}
