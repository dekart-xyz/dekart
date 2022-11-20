package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
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
		})
	}

	// normal datasets
	datasetRows, err := s.db.QueryContext(ctx,
		`select
			id,
			query_id,
			file_id,
			created_at,
			updated_at
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
		if err := datasetRows.Scan(
			&dataset.Id,
			&queryId,
			&fileId,
			&createdAt,
			&updatedAt,
		); err != nil {
			log.Err(err).Msg("Error scanning dataset results")
			return nil, err
		}
		dataset.CreatedAt = createdAt.Unix()
		dataset.UpdatedAt = updatedAt.Unix()
		dataset.QueryId = queryId.String
		dataset.FileId = fileId.String
		datasets = append(datasets, &dataset)
	}
	return datasets, nil
}

func (s Server) getReportID(ctx context.Context, datasetID string, email string) (*string, error) {
	datasetRows, err := s.db.QueryContext(ctx,
		`select report_id from datasets
		where id=$1 and report_id in (select report_id from reports where author_email=$2)
		limit 1`,
		datasetID,
		email,
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
			`select report_id from queries
			where id=$1 and report_id in (select report_id from reports where author_email=$2)
			limit 1`,
			datasetID,
			email,
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
	return &reportID, nil
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

	reportID, err := s.getReportID(ctx, req.DatasetId, claims.Email)

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

func (s Server) CreateDataset(ctx context.Context, req *proto.CreateDatasetRequest) (*proto.CreateDatasetResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	id := newUUID()
	result, err := s.db.ExecContext(ctx,
		`insert into datasets (id, report_id)
		select
			$1 as id,
			id as report_id
		from reports
		where id=$2 and not archived and author_email=$3 limit 1
		`,
		id,
		req.ReportId,
		claims.Email,
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
		err := fmt.Errorf("report=%s, author_email=%s not found", req.ReportId, claims.Email)
		log.Warn().Err(err).Send()
		return nil, status.Errorf(codes.NotFound, err.Error())
	}
	s.reportStreams.Ping(req.ReportId)

	res := &proto.CreateDatasetResponse{}

	return res, nil
}

func (s Server) ServeDatasetSource(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	ctx := r.Context()
	obj := s.storage.GetObject(fmt.Sprintf("%s.%s", vars["id"], vars["extension"]))
	ctreated, err := obj.GetCreatedAt(ctx)
	if err != nil {
		log.Err(err).Send()
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	objectReader, err := obj.GetReader(ctx)
	if err != nil {
		log.Err(err).Send()
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer objectReader.Close()
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Cache-Control", "public, max-age=31536000")
	w.Header().Set("Last-Modified", ctreated.Format(time.UnixDate))
	if _, err := io.Copy(w, objectReader); err != nil {
		log.Err(err).Send()
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}
