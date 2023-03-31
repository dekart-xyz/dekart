package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/user"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func newUUID() string {
	u, err := uuid.NewRandom()
	if err != nil {
		log.Fatal().Err(err).Send()
	}
	return u.String()
}

func (s Server) getReport(ctx context.Context, reportID string) (*proto.Report, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		log.Fatal().Msg("getReport require claims")
	}
	reportRows, err := s.db.QueryContext(ctx,
		`select
			id,
			case when map_config is null then '' else map_config end as map_config,
			case when title is null then 'Untitled' else title end as title,
			author_email = $2 as can_write,
			author_email,
			discoverable
		from reports where id=$1 and not archived limit 1`,
		reportID,
		claims.Email,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	defer reportRows.Close()
	report := &proto.Report{}

	for reportRows.Next() {
		err = reportRows.Scan(
			&report.Id,
			&report.MapConfig,
			&report.Title,
			&report.CanWrite,
			&report.AuthorEmail,
			&report.Discoverable,
		)
		if err != nil {
			log.Err(err).Send()
			return nil, err
		}
	}
	if report.Id == "" {
		return nil, nil // not found
	}
	return report, nil
}

// CreateReport implementation
func (s Server) CreateReport(ctx context.Context, req *proto.CreateReportRequest) (*proto.CreateReportResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	id := newUUID()
	_, err := s.db.ExecContext(ctx,
		"INSERT INTO reports (id, author_email) VALUES ($1, $2)",
		id,
		claims.Email,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	res := &proto.CreateReportResponse{
		Report: &proto.Report{
			Id: id,
		},
	}
	return res, nil
}

func rollback(tx *sql.Tx) {
	err := tx.Rollback()
	if err != nil {
		log.Err(err).Send()
	}
}

// updateDatasetIds updates the map config with new dataset ids when forked
func updateDatasetIds(report *proto.Report, datasets []*proto.Dataset) (newMapConfig string, newDatasetIds []string) {
	newMapConfig = report.MapConfig
	newDatasetIds = make([]string, len(datasets))
	for i, dataset := range datasets {
		newID := newUUID()
		newMapConfig = strings.ReplaceAll(newMapConfig, dataset.Id, newID)
		newDatasetIds[i] = newID
	}
	return newMapConfig, newDatasetIds
}

func (s Server) commitReportWithDatasets(ctx context.Context, report *proto.Report, datasets []*proto.Dataset) error {
	claims := user.GetClaims(ctx)
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{})
	if err != nil {
		return err
	}
	newMapConfig, newDatasetIds := updateDatasetIds(report, datasets)
	_, err = tx.ExecContext(ctx,
		"INSERT INTO reports (id, author_email, map_config, title) VALUES ($1, $2, $3, $4)",
		report.Id,
		claims.Email,
		newMapConfig,
		report.Title,
	)
	if err != nil {
		rollback(tx)
		return err
	}
	for i, dataset := range datasets {
		datasetId := newDatasetIds[i]
		var queryId *string
		var fileId *string
		if dataset.QueryId != "" {
			newQueryID := newUUID()
			queryId = &newQueryID
			_, err = tx.ExecContext(ctx,
				`INSERT INTO queries (
						id,
						query_text,
						query_source,
						query_source_id
					) select 
						$1,
						query_text,
						query_source,
						query_source_id
					from queries where id=$2`,
				newQueryID,
				dataset.QueryId,
			)
			if err != nil {
				log.Debug().Err(err).Send()
				rollback(tx)
				return err
			}
		} else if dataset.FileId != "" {
			newFileID := newUUID()
			fileId = &newFileID
			_, err = tx.ExecContext(ctx, `
				INSERT INTO files (
					id,
					file_source_id,
					name,
					size,
					mime_type,
					file_status,
					upload_error					
				) select
					$1,
					file_source_id,
					name,
					size,
					mime_type,
					file_status,
					upload_error					
				from files where id=$2`, newFileID, dataset.FileId)
			if err != nil {
				log.Debug().Err(err).Send()
				rollback(tx)
				return err
			}
		}
		_, err = tx.ExecContext(ctx, `
			INSERT INTO datasets (id, report_id, query_id, file_id, created_at)
			VALUES($1, $2, $3, $4, $5)`,
			datasetId,
			report.Id,
			queryId,
			fileId,
			time.Unix(dataset.CreatedAt, 0),
		)
		if err != nil {
			log.Debug().Err(err).Send()
			rollback(tx)
			return err
		}
	}
	err = tx.Commit()
	return err
}

func (s Server) ForkReport(ctx context.Context, req *proto.ForkReportRequest) (*proto.ForkReportResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}

	_, err := uuid.Parse(req.ReportId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, err.Error())
	}

	reportID := newUUID()

	report, err := s.getReport(ctx, req.ReportId)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	if report == nil {
		err := fmt.Errorf("report %s not found", reportID)
		log.Warn().Err(err).Send()
		return nil, status.Errorf(codes.NotFound, err.Error())
	}
	report.Id = reportID
	report.Title = fmt.Sprintf("Fork of %s", report.Title)

	datasets, err := s.getDatasets(ctx, req.ReportId)
	if err != nil {
		log.Err(err).Msg("Cannot retrieve datasets")
		return nil, err
	}

	err = s.commitReportWithDatasets(ctx, report, datasets)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}

	return &proto.ForkReportResponse{
		ReportId: reportID,
	}, nil
}

// UpdateReport implementation
func (s Server) UpdateReport(ctx context.Context, req *proto.UpdateReportRequest) (*proto.UpdateReportResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	if req.Report == nil {
		return nil, status.Errorf(codes.InvalidArgument, "req.Report == nil")
	}
	result, err := s.db.ExecContext(ctx,
		`update
			reports
		set map_config=$1, title=$2
		where id=$3 and author_email=$4`,
		req.Report.MapConfig,
		req.Report.Title,
		req.Report.Id,
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
		// TODO: distinguish between not found and read only
		err := fmt.Errorf("report not found id:%s", req.Report.Id)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}

	// save queries
	for _, query := range req.Query {
		go s.storeQuery(req.Report.Id, query.Id, query.QueryText, query.QuerySourceId)
	}

	s.reportStreams.Ping(req.Report.Id)

	return &proto.UpdateReportResponse{}, nil
}

func (s Server) SetDiscoverable(ctx context.Context, req *proto.SetDiscoverableRequest) (*proto.SetDiscoverableResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	_, err := uuid.Parse(req.ReportId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, err.Error())
	}
	res, err := s.db.ExecContext(ctx,
		`update reports set discoverable=$1 where id=$2 and author_email=$3`,
		req.Discoverable,
		req.ReportId,
		claims.Email,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	affectedRows, err := res.RowsAffected()

	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	if affectedRows == 0 {
		err := fmt.Errorf("report not found id:%s", req.ReportId)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}
	s.reportStreams.Ping(req.ReportId)

	return &proto.SetDiscoverableResponse{}, nil
}

// ArchiveReport implementation
func (s Server) ArchiveReport(ctx context.Context, req *proto.ArchiveReportRequest) (*proto.ArchiveReportResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	_, err := uuid.Parse(req.ReportId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, err.Error())
	}
	result, err := s.db.ExecContext(ctx,
		"update reports set archived=$1 where id=$2 and author_email=$3",
		req.Archive,
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
		err := fmt.Errorf("report not found id:%s", req.ReportId)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}
	s.reportStreams.Ping(req.ReportId)

	return &proto.ArchiveReportResponse{}, nil

}
