package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/user"
	"fmt"
	"time"

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
		if err := datasetRows.Scan(
			&dataset.Id,
			&queryId,
			&createdAt,
			&updatedAt,
		); err != nil {
			log.Err(err).Msg("Error scanning dataset results")
			return nil, err
		}
		dataset.CreatedAt = createdAt.Unix()
		dataset.UpdatedAt = updatedAt.Unix()
		dataset.QueryId = queryId.String
		datasets = append(datasets, &dataset)
	}
	return datasets, nil
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
