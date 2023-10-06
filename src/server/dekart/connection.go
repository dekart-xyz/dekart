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
	return storage.TestConnection(ctx, req.Connection)
}

func (s Server) getBucketNameFromConnection(conn *proto.Connection) string {
	if conn == nil {
		return storage.GetDefaultBucketName()
	}

	bucketName := conn.CloudStorageBucket

	if bucketName == "" {
		log.Warn().Msgf("connection %s has no bucket name", conn.Id)
	}
	return bucketName
}

func (s Server) getConnectionFromDatasetID(ctx context.Context, datasetID string) (*proto.Connection, error) {
	var connectionID sql.NullString
	err := s.db.QueryRowContext(ctx,
		`select
			connection_id
		from datasets
		where id=$1 limit 1`,
		datasetID,
	).Scan(&connectionID)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	return s.getConnection(ctx, connectionID.String)
}

func (s Server) getConnectionFromQueryID(ctx context.Context, queryID string) (*proto.Connection, error) {
	var connectionID sql.NullString
	err := s.db.QueryRowContext(ctx,
		`select
			connection_id
		from queries join datasets on (queries.id=datasets.query_id)
		where queries.id=$1 limit 1`,
		queryID,
	).Scan(&connectionID)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	return s.getConnection(ctx, connectionID.String)
}

func (s Server) getConnectionFromFileID(ctx context.Context, fileID string) (*proto.Connection, error) {
	var connectionID sql.NullString
	err := s.db.QueryRowContext(ctx,
		`select
			connection_id
		from files join datasets on (files.id=datasets.file_id)
		where files.id=$1 limit 1`,
		fileID,
	).Scan(&connectionID)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	return s.getConnection(ctx, connectionID.String)
}

func (s Server) getConnection(ctx context.Context, connectionID string) (*proto.Connection, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		err := fmt.Errorf("unauthenticated request")
		log.Err(err).Send()
		return nil, err
	}

	if connectionID == "default" || connectionID == "" {
		return &proto.Connection{
			Id:                 "default",
			ConnectionName:     "default",
			CloudStorageBucket: storage.GetDefaultBucketName(),
			BigqueryProjectId:  os.Getenv("DEKART_BIGQUERY_PROJECT_ID"),
			IsDefault:          true,
		}, nil
	}

	res, err := s.db.QueryContext(ctx, `
		select
			id,
			connection_name,
			bigquery_project_id,
			cloud_storage_bucket
		from connections where id=$1 and author_email=$2 and archived=false limit 1`,
		connectionID,
		claims.Email,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	defer res.Close()
	connection := proto.Connection{}
	for res.Next() {
		ID := sql.NullString{}
		bigqueryProjectId := sql.NullString{}
		cloudStorageBucket := sql.NullString{}
		err := res.Scan(
			&ID,
			&connection.ConnectionName,
			&bigqueryProjectId,
			&cloudStorageBucket,
		)
		connection.Id = ID.String
		connection.BigqueryProjectId = bigqueryProjectId.String
		connection.CloudStorageBucket = cloudStorageBucket.String
		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}
	}
	if connection.Id == "" {
		log.Warn().Msgf("connection not found id:%s", connectionID)
		return nil, nil
	}
	return &connection, nil
}

func (s Server) getConnections(ctx context.Context) ([]*proto.Connection, error) {

	connections := make([]*proto.Connection, 0)
	claims := user.GetClaims(ctx)
	if claims == nil {
		log.Warn().Msg("unauthenticated getConnections request")
		return connections, nil
	}

	rows, err := s.db.QueryContext(ctx,
		`select
			id,
			connection_name,
			bigquery_project_id,
			cloud_storage_bucket
		from connections where author_email=$1 and archived=false order by created_at asc`,
		claims.Email,
	)
	if err != nil {
		log.Fatal().Err(err).Msg("select from connections failed")
	}
	defer rows.Close()
	for rows.Next() {
		connection := proto.Connection{}
		ID := sql.NullString{}
		bigqueryProjectId := sql.NullString{}
		cloudStorageBucket := sql.NullString{}
		err := rows.Scan(
			&ID,
			&connection.ConnectionName,
			&bigqueryProjectId,
			&cloudStorageBucket,
		)
		connection.Id = ID.String
		connection.BigqueryProjectId = bigqueryProjectId.String
		connection.CloudStorageBucket = cloudStorageBucket.String
		if err != nil {
			log.Fatal().Err(err).Msg("scan failed")
		}
		connections = append(connections, &connection)
	}

	return connections, nil

}

func (s Server) UpdateConnection(ctx context.Context, req *proto.UpdateConnectionRequest) (*proto.UpdateConnectionResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	res, err := s.db.ExecContext(ctx,
		`update connections set
			connection_name=$1,
			bigquery_project_id=$2,
			cloud_storage_bucket=$3,
			updated_at=now()
		where id=$4 and author_email=$5`,
		req.Connection.ConnectionName,
		req.Connection.BigqueryProjectId,
		req.Connection.CloudStorageBucket,
		req.Connection.Id,
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
		return nil, status.Error(codes.NotFound, "connection not found")
	}
	s.userStreams.Ping([]string{claims.Email})
	return &proto.UpdateConnectionResponse{
		Connection: req.Connection,
	}, nil
}

func (s Server) getReportsAffectedByConnectionArchive(ctx context.Context, connectionID string) ([]string, error) {
	reportIDs := make([]string, 0)
	rows, err := s.db.QueryContext(ctx,
		`select
			reports.id
		from reports
		join datasets on (reports.id=datasets.report_id)
		where datasets.connection_id=$1 and datasets.file_id is null and datasets.query_id is null`,
		connectionID,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		reportID := sql.NullString{}
		err := rows.Scan(
			&reportID,
		)
		if err != nil {
			log.Err(err).Send()
			return nil, err
		}
		reportIDs = append(reportIDs, reportID.String)
	}
	return reportIDs, nil
}

func (s Server) ArchiveConnection(ctx context.Context, req *proto.ArchiveConnectionRequest) (*proto.ArchiveConnectionResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	res, err := s.db.ExecContext(ctx,
		`update connections set
			archived=true,
			updated_at=now()
		where id=$1 and author_email=$2`,
		req.ConnectionId,
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
		return nil, status.Error(codes.NotFound, "connection not found")
	}
	reports, err := s.getReportsAffectedByConnectionArchive(ctx, req.ConnectionId)

	if err != nil {
		log.Err(err).Send()
		return nil, err
	}

	_, err = s.db.ExecContext(ctx,
		`update datasets set
			connection_id=null,
			updated_at=now()
		where connection_id=$1 and file_id is null and query_id is null`,
		req.ConnectionId,
	)

	if err != nil {
		log.Err(err).Send()
		return nil, err
	}

	s.userStreams.Ping([]string{claims.Email})
	s.reportStreams.PingAll(reports)
	return &proto.ArchiveConnectionResponse{}, nil
}

func (s Server) GetConnectionList(ctx context.Context, req *proto.GetConnectionListRequest) (*proto.GetConnectionListResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	connections, err := s.getConnections(ctx)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &proto.GetConnectionListResponse{
		Connections: connections,
	}, nil
}

func (s Server) getLastConnectionUpdate(ctx context.Context) (int64, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return 0, Unauthenticated
	}
	var lastConnectionUpdateDate sql.NullTime
	err := s.db.QueryRowContext(ctx,
		`select
			max(updated_at)
		from connections where author_email=$1`,
		claims.Email,
	).Scan(&lastConnectionUpdateDate)
	lastConnectionUpdate := lastConnectionUpdateDate.Time.Unix()
	if err != nil {
		log.Err(err).Send()
		return 0, err
	}
	return lastConnectionUpdate, nil
}

func (s Server) CreateConnection(ctx context.Context, req *proto.CreateConnectionRequest) (*proto.CreateConnectionResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	id := newUUID()
	_, err := s.db.ExecContext(ctx,
		"INSERT INTO connections (id, connection_name,  author_email) VALUES ($1, $2, $3)",
		id,
		req.ConnectionName,
		claims.Email,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}

	s.userStreams.Ping([]string{claims.Email})

	return &proto.CreateConnectionResponse{
		Connection: &proto.Connection{
			Id:             id,
			ConnectionName: req.ConnectionName,
		},
	}, nil
}
