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
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (s Server) getDatasets(ctx context.Context, reportID string) ([]*proto.Dataset, error) {
	datasets := make([]*proto.Dataset, 0)

	// add legacy queries
	queries, err := s.getQueriesLegacy(ctx, reportID)
	if err != nil {
		return nil, err
	}
	for _, query := range queries {
		datasets = append(datasets, &proto.Dataset{
			Id:        query.Id,
			ReportId:  reportID,
			QueryId:   query.Id,
			CreatedAt: query.CreatedAt,
			UpdatedAt: query.UpdatedAt,
			Name:      "",
		})
	}

	// normal datasets
	datasetRows, err := s.db.QueryContext(ctx,
		`select
			id,
			query_id,
			file_id,
			created_at,
			updated_at,
			name,
			connection_id
		from datasets where report_id=$1 order by created_at asc`,
		reportID,
	)
	if err != nil {
		log.Fatal().Err(err).Str("reportID", reportID).Msg("select from queries failed")
	}
	defer datasetRows.Close()
	for datasetRows.Next() {
		dataset := proto.Dataset{
			ReportId: reportID,
		}
		var createdAt time.Time
		var updatedAt time.Time
		var queryId sql.NullString
		var fileId sql.NullString
		var connectionID sql.NullString
		if err := datasetRows.Scan(
			&dataset.Id,
			&queryId,
			&fileId,
			&createdAt,
			&updatedAt,
			&dataset.Name,
			&connectionID,
		); err != nil {
			log.Err(err).Msg("Error scanning dataset results")
			return nil, err
		}
		dataset.CreatedAt = createdAt.Unix()
		dataset.UpdatedAt = updatedAt.Unix()
		dataset.QueryId = queryId.String
		dataset.FileId = fileId.String
		dataset.ConnectionId = connectionID.String
		datasets = append(datasets, &dataset)
	}
	return datasets, nil
}

// getReportID returns by dataset id and checks if user has access to the report
func (s Server) getReportID(ctx context.Context, datasetID string, canWrite bool) (*string, error) {
	var datasetRows *sql.Rows
	var err error
	datasetRows, err = s.db.QueryContext(ctx,
		`select report_id from datasets where id=$1`,
		datasetID,
	)
	if err != nil {
		return nil, err
	}
	defer datasetRows.Close()
	var reportID string
	for datasetRows.Next() {
		err := datasetRows.Scan(&reportID)
		if err != nil {
			return nil, err
		}
	}
	if reportID == "" {
		// check legacy queries
		queryRows, err := s.db.QueryContext(ctx,
			`select report_id from queries where id=$1 limit 1`,
			datasetID,
		)
		if err != nil {
			return nil, err
		}
		defer queryRows.Close()
		for queryRows.Next() {
			err := queryRows.Scan(&reportID)
			if err != nil {
				return nil, err
			}
		}
		if reportID == "" {
			return nil, nil
		}
	}
	// check if user has access to the report
	report, err := s.getReport(ctx, reportID)
	if err != nil {
		return nil, err
	}
	if report == nil {
		return nil, nil
	}
	if canWrite && !report.CanWrite {
		return nil, nil
	}
	return &reportID, nil
}

func (s Server) UpdateDatasetName(ctx context.Context, req *proto.UpdateDatasetNameRequest) (*proto.UpdateDatasetNameResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}

	reportID, err := s.getReportID(ctx, req.DatasetId, true)

	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	if reportID == nil {
		err := fmt.Errorf("dataset not found id:%s", req.DatasetId)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}

	_, err = s.db.ExecContext(ctx,
		`update
			datasets set
			name = $1
			where id=$2`,
		req.Name,
		req.DatasetId,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	s.reportStreams.Ping(*reportID)

	return &proto.UpdateDatasetNameResponse{}, nil
}

func (s Server) UpdateDatasetConnection(ctx context.Context, req *proto.UpdateDatasetConnectionRequest) (*proto.UpdateDatasetConnectionResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}

	reportID, err := s.getReportID(ctx, req.DatasetId, true)

	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	if reportID == nil {
		err := fmt.Errorf("dataset not found id:%s", req.DatasetId)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}

	_, err = s.db.ExecContext(ctx,
		`update
			datasets set
			connection_id = $1
			where id=$2`,
		req.ConnectionId,
		req.DatasetId,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	s.reportStreams.Ping(*reportID)

	return &proto.UpdateDatasetConnectionResponse{}, nil
}

func (s Server) RemoveDataset(ctx context.Context, req *proto.RemoveDatasetRequest) (*proto.RemoveDatasetResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	_, err := uuid.Parse(req.DatasetId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, err.Error())
	}

	reportID, err := s.getReportID(ctx, req.DatasetId, true)

	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	if reportID == nil {
		err := fmt.Errorf("dataset not found id:%s", req.DatasetId)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}

	// s.jobs.Cancel(req.QueryId)

	_, err = s.db.ExecContext(ctx,
		`delete from datasets where id=$1`,
		req.DatasetId,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	// legacy queries
	_, err = s.db.ExecContext(ctx,
		`delete from queries where id=$1`,
		req.DatasetId,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	s.reportStreams.Ping(*reportID)

	return &proto.RemoveDatasetResponse{}, nil
}

func (s Server) insertDataset(ctx context.Context, reportID string) (res sql.Result, err error) {
	id := newUUID()
	claims := user.GetClaims(ctx)
	connection, err := s.getDefaultConnection(ctx)
	if err != nil {
		return nil, err
	}
	if connection == nil {
		return s.db.ExecContext(ctx,
			`insert into datasets (id, report_id)
		select
			$1 as id,
			id as report_id
		from reports
		where id=$2 and not archived and (author_email=$3 or allow_edit) limit 1
		`,
			id,
			reportID,
			claims.Email,
		)
	}
	return s.db.ExecContext(ctx,
		`insert into datasets (id, report_id, connection_id)
	select
		$1 as id,
		id as report_id,
		$4 as connection_id
	from reports
	where id=$2 and not archived and (author_email=$3 or allow_edit) limit 1
	`,
		id,
		reportID,
		claims.Email,
		connection.Id,
	)
}

func (s Server) CreateDataset(ctx context.Context, req *proto.CreateDatasetRequest) (*proto.CreateDatasetResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	result, err := s.insertDataset(ctx, req.ReportId)

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
		err := fmt.Errorf("report=%s, author_email=%s not found", req.ReportId, claims.Email)
		log.Warn().Err(err).Send()
		return nil, status.Errorf(codes.NotFound, err.Error())
	}
	s.reportStreams.Ping(req.ReportId)
	s.userStreams.PingAll() // because dataset count is now part of connection info
	res := &proto.CreateDatasetResponse{}

	return res, nil
}

// process storage expired error
func storageError(w http.ResponseWriter, err error) {
	if _, ok := err.(*errtype.Expired); ok {
		http.Error(w, "expired", http.StatusGone)
		return
	}
	HttpError(w, err)
}

func (s Server) getDWJobIDFromResultID(ctx context.Context, resultID string) (string, error) {
	var jobID sql.NullString
	rows, err := s.db.QueryContext(ctx,
		`select dw_job_id from queries where job_result_id=$1`,
		resultID,
	)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	if rows.Next() {
		err := rows.Scan(&jobID)
		if err != nil {
			return "", err
		}
		return jobID.String, nil
	}
	return "", nil
}

// since reading is using connection no auth is needed here
func (s Server) ServeDatasetSource(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	userCtx := r.Context()

	claims := user.GetClaims(userCtx)
	if claims == nil {
		http.Error(w, Unauthenticated.Error(), http.StatusUnauthorized)
		return
	}
	_, err := uuid.Parse(vars["dataset"])
	if err != nil {
		log.Warn().Err(err).Msg("Invalid dataset id while serving dataset source")
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	reportID, err := s.getReportID(userCtx, vars["dataset"], false)

	if err != nil {
		log.Err(err).Send()
		HttpError(w, err)
		return
	}

	if reportID == nil {
		err := fmt.Errorf("dataset not found id:%s", vars["dataset"])
		log.Warn().Err(err).Send()
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	report, err := s.getReport(userCtx, *reportID)

	if err != nil {
		log.Err(err).Send()
		HttpError(w, err)
		return
	}

	if report == nil {
		err := fmt.Errorf("report not found id:%s", *reportID)
		log.Warn().Err(err).Send()
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	connection, err := s.getConnectionFromDatasetID(userCtx, vars["dataset"])

	if err != nil {
		HttpError(w, err)
		return
	}

	if connection == nil {
		err := fmt.Errorf("connection not found id:%s", vars["dataset"])
		log.Warn().Err(err).Send()
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	bucketName := s.getBucketNameFromConnection(connection)

	userConCtx := conn.GetCtx(userCtx, connection)
	dwJobID, err := s.getDWJobIDFromResultID(userCtx, vars["source"])
	if err != nil {
		log.Error().Err(err).Msg("Error getting dw job id")
		HttpError(w, err)
		return
	}

	var obj storage.StorageObject

	if dwJobID != "" {
		// temp data warehouse table is used as source
		log.Debug().Str("source", vars["source"]).Msg("Serving dataset source from temporary storage")
		obj = s.storage.GetObject(userConCtx, bucketName, dwJobID)
	} else {
		// file stored on the bucket is used as source
		log.Debug().Str("source", vars["source"]).Msg("Serving dataset source from user storage")
		obj = s.storage.GetObject(userConCtx, bucketName, fmt.Sprintf("%s.%s", vars["source"], vars["extension"]))
	}

	created, err := obj.GetCreatedAt(userCtx)
	if err != nil {
		storageError(w, err)
		return
	}
	objectReader, err := obj.GetReader(userCtx)
	if err != nil {
		storageError(w, err)
		return
	}
	defer objectReader.Close()
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Cache-Control", "public, max-age=31536000")
	w.Header().Set("Last-Modified", created.Format(time.UnixDate))
	if _, err := io.Copy(w, objectReader); err != nil {
		HttpError(w, err)
		return
	}
}
