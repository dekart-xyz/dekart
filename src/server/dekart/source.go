package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/storage"
	"dekart/src/server/user"
	"fmt"
	"os"

	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (s Server) TestConnection(ctx context.Context, req *proto.TestConnectionRequest) (*proto.TestConnectionResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	res, err := s.jobs.TestConnection(ctx, req)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	if !res.Success {
		return res, nil
	}
	return storage.TestConnection(ctx, req.Source)
}

func (s Server) getBucketNameFromSource(source *proto.Source) string {
	if source == nil {
		return storage.GetDefaultBucketName()
	}

	bucketName := source.CloudStorageBucket

	if bucketName == "" {
		log.Warn().Msgf("source %s has no bucket name", source.Id)
	}
	return bucketName
}

func (s Server) getSourceFromDatasetID(ctx context.Context, datasetID string) (*proto.Source, error) {
	var sourceID sql.NullString
	err := s.db.QueryRowContext(ctx,
		`select
			source_id
		from datasets
		where id=$1 limit 1`,
		datasetID,
	).Scan(&sourceID)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	return s.getSource(ctx, sourceID.String)
}

func (s Server) getSourceFromQueryID(ctx context.Context, queryID string) (*proto.Source, error) {
	var sourceID sql.NullString
	err := s.db.QueryRowContext(ctx,
		`select
			source_id
		from queries join datasets on (queries.id=datasets.query_id)
		where queries.id=$1 limit 1`,
		queryID,
	).Scan(&sourceID)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	return s.getSource(ctx, sourceID.String)
}

func (s Server) getSource(ctx context.Context, sourceID string) (*proto.Source, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		err := fmt.Errorf("unauthenticated sources request")
		log.Err(err).Send()
		return nil, err
	}

	if sourceID == "default" || sourceID == "" {
		return &proto.Source{
			Id:                 "default",
			SourceName:         "default",
			CloudStorageBucket: storage.GetDefaultBucketName(),
			BigqueryProjectId:  os.Getenv("DEKART_BIGQUERY_PROJECT_ID"),
			IsDefault:          true,
		}, nil
	}

	res, err := s.db.QueryContext(ctx, `
		select
			id,
			source_name,
			bigquery_project_id,
			cloud_storage_bucket
		from sources where id=$1 and author_email=$2 and archived=false limit 1`,
		sourceID,
		claims.Email,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	defer res.Close()
	source := proto.Source{}
	for res.Next() {
		ID := sql.NullString{}
		bigqueryProjectId := sql.NullString{}
		cloudStorageBucket := sql.NullString{}
		err := res.Scan(
			&ID,
			&source.SourceName,
			&bigqueryProjectId,
			&cloudStorageBucket,
		)
		source.Id = ID.String
		source.BigqueryProjectId = bigqueryProjectId.String
		source.CloudStorageBucket = cloudStorageBucket.String
		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}
	}
	if source.Id == "" {
		log.Warn().Msgf("source not found id:%s", sourceID)
		return nil, nil
	}
	return &source, nil
}

func (s Server) getSources(ctx context.Context) ([]*proto.Source, error) {

	sources := make([]*proto.Source, 0)
	claims := user.GetClaims(ctx)
	if claims == nil {
		log.Warn().Msg("unauthenticated sources request")
		return sources, nil
	}

	rows, err := s.db.QueryContext(ctx,
		`select
			id,
			source_name,
			bigquery_project_id,
			cloud_storage_bucket
		from sources where author_email=$1 and archived=false order by created_at asc`,
		claims.Email,
	)
	if err != nil {
		log.Fatal().Err(err).Msg("select from sources failed")
	}
	defer rows.Close()
	for rows.Next() {
		source := proto.Source{}
		ID := sql.NullString{}
		bigqueryProjectId := sql.NullString{}
		cloudStorageBucket := sql.NullString{}
		err := rows.Scan(
			&ID,
			&source.SourceName,
			&bigqueryProjectId,
			&cloudStorageBucket,
		)
		source.Id = ID.String
		source.BigqueryProjectId = bigqueryProjectId.String
		source.CloudStorageBucket = cloudStorageBucket.String
		if err != nil {
			log.Fatal().Err(err).Msg("scan failed")
		}
		sources = append(sources, &source)
	}

	return sources, nil

}

func (s Server) UpdateSource(ctx context.Context, req *proto.UpdateSourceRequest) (*proto.UpdateSourceResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	res, err := s.db.ExecContext(ctx,
		`update sources set
			source_name=$1,
			bigquery_project_id=$2,
			cloud_storage_bucket=$3,
			updated_at=now()
		where id=$4 and author_email=$5`,
		req.Source.SourceName,
		req.Source.BigqueryProjectId,
		req.Source.CloudStorageBucket,
		req.Source.Id,
		claims.Email,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	if rowsAffected == 0 {
		return nil, status.Error(codes.NotFound, "source not found")
	}
	s.userStreams.Ping([]string{claims.Email})
	return &proto.UpdateSourceResponse{
		Source: req.Source,
	}, nil
}

func (s Server) ArchiveSource(ctx context.Context, req *proto.ArchiveSourceRequest) (*proto.ArchiveSourceResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	res, err := s.db.ExecContext(ctx,
		`update sources set
			archived=true,
			updated_at=now()
		where id=$1 and author_email=$2`,
		req.SourceId,
		claims.Email,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	if rowsAffected == 0 {
		return nil, status.Error(codes.NotFound, "source not found")
	}
	s.userStreams.Ping([]string{claims.Email})
	return &proto.ArchiveSourceResponse{}, nil
}

func (s Server) GetSourceList(ctx context.Context, req *proto.GetSourceListRequest) (*proto.GetSourceListResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	sources, err := s.getSources(ctx)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &proto.GetSourceListResponse{
		Sources: sources,
	}, nil
}

func (s Server) getLastSourceUpdate(ctx context.Context) (int64, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return 0, Unauthenticated
	}
	var lastSourceUpdateDate sql.NullTime
	err := s.db.QueryRowContext(ctx,
		`select
			max(updated_at)
		from sources where author_email=$1`,
		claims.Email,
	).Scan(&lastSourceUpdateDate)
	lastSourceUpdate := lastSourceUpdateDate.Time.Unix()
	if err != nil {
		log.Err(err).Send()
		return 0, err
	}
	return lastSourceUpdate, nil
}

func (s Server) CreateSource(ctx context.Context, req *proto.CreateSourceRequest) (*proto.CreateSourceResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	id := newUUID()
	_, err := s.db.ExecContext(ctx,
		"INSERT INTO sources (id, source_name,  author_email) VALUES ($1, $2, $3)",
		id,
		req.SourceName,
		claims.Email,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}

	s.userStreams.Ping([]string{claims.Email})

	return &proto.CreateSourceResponse{
		Source: &proto.Source{
			Id:         id,
			SourceName: req.SourceName,
		},
	}, nil
}
