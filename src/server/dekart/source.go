package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/storage"
	"dekart/src/server/user"

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
			author_email,
			bigquery_project_id,
			cloud_storage_bucket,
			created_at,
			updated_at
		from sources where author_email=$1 order by created_at asc`,
		claims.Email,
	)
	if err != nil {
		log.Fatal().Err(err).Msg("select from sources failed")
	}
	defer rows.Close()
	for rows.Next() {
		source := proto.Source{}
		bigqueryProjectId := sql.NullString{}
		cloudStorageBucket := sql.NullString{}
		err := rows.Scan(
			&source.Id,
			&source.SourceName,
			&bigqueryProjectId,
			&cloudStorageBucket,
		)
		if err != nil {
			log.Fatal().Err(err).Msg("scan failed")
		}
		sources = append(sources, &source)
	}

	return sources, nil

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

	return nil, nil
}
