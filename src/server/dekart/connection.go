package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/conn"
	"dekart/src/server/errtype"
	"dekart/src/server/secrets"
	"dekart/src/server/storage"
	"dekart/src/server/user"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (s Server) TestConnection(ctx context.Context, req *proto.TestConnectionRequest) (*proto.TestConnectionResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	con := req.Connection
	if con == nil {
		return nil, status.Error(codes.InvalidArgument, "connection is required")
	}

	err := conn.ValidateReqConnection(con)
	if err != nil {
		return &proto.TestConnectionResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}

	res, err := s.jobs.TestConnection(ctx, req)
	if err != nil {
		errtype.LogError(err, "TestConnection failed")
		return nil, status.Error(codes.Internal, err.Error())
	}
	if !res.Success {
		return res, nil
	}
	if req.Connection.CloudStorageBucket == "" && os.Getenv("DEKART_STORAGE") == "USER" {
		// if no bucket is provided, temp storage is used
		return &proto.TestConnectionResponse{
			Success: true,
		}, nil
	}
	return storage.TestConnection(ctx, req.Connection)
}

func (s Server) getBucketNameFromConnection(con *proto.Connection) string {
	if conn.IsSystemConnectionID(con.Id) {
		return storage.GetDefaultBucketName()
	}

	bucketName := con.CloudStorageBucket

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
		if err == sql.ErrNoRows {
			// legacy query
			return s.getConnection(ctx, "")
		}
		errtype.LogError(err, "select from datasets failed")
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
		if err == sql.ErrNoRows {
			// legacy query
			return s.getConnection(ctx, "")
		}
		errtype.LogError(err, "select from queries failed")
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
		errtype.LogError(err, "select from files failed")
		return nil, err
	}
	return s.getConnection(ctx, connectionID.String)
}

// getConnection gets connection by id; it does not check if user has access to it or if it is archived
func (s Server) getConnection(ctx context.Context, connectionID string) (*proto.Connection, error) {
	if conn.IsSystemConnectionID(connectionID) {
		con := proto.Connection{
			Id:             conn.SystemConnectionID,
			ConnectionName: "default",
			IsDefault:      true,
		}

		switch os.Getenv("DEKART_DATASOURCE") {
		case "USER":
			if os.Getenv("DEKART_CLOUD") != "" {
				con.CloudStorageBucket = storage.GetDefaultBucketName()
				con.BigqueryProjectId = os.Getenv("DEKART_BIGQUERY_PROJECT_ID")
				con.ConnectionType = proto.ConnectionType_CONNECTION_TYPE_BIGQUERY
				con.CanStoreFiles = os.Getenv("DEKART_ALLOW_FILE_UPLOAD") != ""
				return &con, nil
			}
			return nil, nil
		case "SNOWFLAKE":
			con.ConnectionType = proto.ConnectionType_CONNECTION_TYPE_SNOWFLAKE
			con.ConnectionName = "Snowflake"
			con.CloudStorageBucket = storage.GetDefaultBucketName()
		case "ATHENA":
			con.ConnectionType = proto.ConnectionType_CONNECTION_TYPE_ATHENA
			con.ConnectionName = "Athena"
		case "PG":
			con.ConnectionType = proto.ConnectionType_CONNECTION_TYPE_POSTGRES
			con.ConnectionName = "Postgres"
		case "BQ":
			con.ConnectionType = proto.ConnectionType_CONNECTION_TYPE_BIGQUERY
			con.ConnectionName = "BigQuery"
			con.BigqueryProjectId = os.Getenv("DEKART_BIGQUERY_PROJECT_ID")
			con.CloudStorageBucket = storage.GetDefaultBucketName()
		case "CH":
			con.ConnectionType = proto.ConnectionType_CONNECTION_TYPE_CLICKHOUSE
			con.ConnectionName = "ClickHouse"
		default:
			log.Fatal().Str("DEKART_STORAGE", os.Getenv("DEKART_STORAGE")).Msg("Unknown storage backend")
		}
		if os.Getenv("DEKART_ALLOW_FILE_UPLOAD") != "" && con.CloudStorageBucket != "" {
			con.CanStoreFiles = true
		}

		return &con, nil
	}

	res, err := s.db.QueryContext(ctx, `
		select
			id,
			connection_name,
			bigquery_project_id,
			cloud_storage_bucket,
			connection_type,
			snowflake_account_id,
			snowflake_username,
			snowflake_password_encrypted,
			snowflake_key_encrypted,
			snowflake_warehouse,
			bigquery_key_encrypted,
			(select count(*) from datasets where connection_id=connections.id) as dataset_count,
			wherobots_host,
			wherobots_key_encrypted,
			wherobots_region,
			wherobots_runtime
		from connections where id=$1 limit 1`,
		connectionID,
	)
	if err != nil {
		errtype.LogError(err, "select from connections failed")
		return nil, err
	}
	defer res.Close()
	connection := proto.Connection{}
	for res.Next() {
		ID := sql.NullString{}
		bigqueryProjectId := sql.NullString{}
		cloudStorageBucket := sql.NullString{}
		var connectionType proto.ConnectionType
		snowflakeUser := sql.NullString{}
		snowflakePassword := sql.NullString{}
		snowflakeKey := sql.NullString{}
		whererobotsKeyEncrypted := sql.NullString{}
		whererobotsHost := sql.NullString{}
		whererobotsRegion := sql.NullString{}
		whererobotsRuntime := sql.NullString{}
		bigqueryKey := sql.NullString{}
		snowflakeAccountID := sql.NullString{}
		snowflakeWarehouse := sql.NullString{}
		err := res.Scan(
			&ID,
			&connection.ConnectionName,
			&bigqueryProjectId,
			&cloudStorageBucket,
			&connectionType,
			&snowflakeAccountID,
			&snowflakeUser,
			&snowflakePassword,
			&snowflakeKey,
			&snowflakeWarehouse,
			&bigqueryKey,
			&connection.DatasetCount,
			&whererobotsHost,
			&whererobotsKeyEncrypted,
			&whererobotsRegion,
			&whererobotsRuntime,
		)
		connection.Id = ID.String
		connection.BigqueryProjectId = bigqueryProjectId.String
		connection.CloudStorageBucket = cloudStorageBucket.String
		connection.ConnectionType = connectionType
		connection.SnowflakeUsername = snowflakeUser.String
		connection.SnowflakeAccountId = snowflakeAccountID.String
		connection.SnowflakeWarehouse = snowflakeWarehouse.String
		connection.WherobotsHost = whererobotsHost.String
		connection.WherobotsRegion = whererobotsRegion.String
		connection.WherobotsRuntime = whererobotsRuntime.String
		if snowflakePassword.String != "" {
			connection.SnowflakePassword = &proto.Secret{
				ServerEncrypted: snowflakePassword.String,
			}
		}
		if snowflakeKey.String != "" {
			connection.SnowflakeKey = &proto.Secret{
				ServerEncrypted: snowflakeKey.String,
			}
		}
		if bigqueryKey.String != "" {
			connection.BigqueryKey = &proto.Secret{
				ServerEncrypted: bigqueryKey.String,
			}
		}
		if whererobotsKeyEncrypted.String != "" {
			connection.WherobotsKey = &proto.Secret{
				ServerEncrypted: whererobotsKeyEncrypted.String,
			}
		}
		if connection.CloudStorageBucket != "" {
			connection.CanStoreFiles = true
		}
		if err != nil {
			errtype.LogError(err, "scan failed")
			return nil, status.Error(codes.Internal, err.Error())
		}
	}
	if connection.Id == "" {
		log.Warn().Msgf("connection not found id:%s", connectionID)
		return nil, nil
	}
	return &connection, nil
}

// getUserConnections list for connections created by user
func (s Server) getUserConnections(ctx context.Context) ([]*proto.Connection, error) {
	connections := make([]*proto.Connection, 0)
	rows, err := s.db.QueryContext(ctx,
		`select
			id,
			connection_name,
			bigquery_project_id,
			cloud_storage_bucket,
			connection_type,
			snowflake_account_id,
			snowflake_username,
			snowflake_password_encrypted,
			snowflake_key_encrypted,
			snowflake_warehouse,
			is_default,
			created_at,
			updated_at,
			author_email,
			bigquery_key_encrypted,
			(select count(*) from datasets where connection_id=connections.id) as dataset_count,
			wherobots_host,
			wherobots_key_encrypted,
			wherobots_region,
			wherobots_runtime
		from connections where archived=false and workspace_id=$1 order by created_at desc`,
		checkWorkspace(ctx).ID,
	)
	if err != nil {
		if err == context.Canceled {
			return nil, err
		}
		errtype.LogError(err, "select from connections failed")
		return nil, err
	}
	defer rows.Close()
	lastDefault := time.Time{}
	lastDefaultIndex := -1
	for rows.Next() {
		connection := proto.Connection{}
		ID := sql.NullString{}
		bigqueryProjectId := sql.NullString{}
		cloudStorageBucket := sql.NullString{}
		snowflakeAccountID := sql.NullString{}
		snowflakeUsername := sql.NullString{}
		snowflakePassword := sql.NullString{}
		snowflakeKey := sql.NullString{}
		wherobotsHost := sql.NullString{}
		wherobotsKeyEncrypted := sql.NullString{}
		wherobotsRegion := sql.NullString{}
		wherobotsRuntime := sql.NullString{}
		bigqueryKey := sql.NullString{}
		snowflakeWarehouse := sql.NullString{}
		isDefault := false
		createdAt := time.Time{}
		updatedAt := time.Time{}
		err := rows.Scan(
			&ID,
			&connection.ConnectionName,
			&bigqueryProjectId,
			&cloudStorageBucket,
			&connection.ConnectionType,
			&snowflakeAccountID,
			&snowflakeUsername,
			&snowflakePassword,
			&snowflakeKey,
			&snowflakeWarehouse,
			&isDefault,
			&createdAt,
			&updatedAt,
			&connection.AuthorEmail,
			&bigqueryKey,
			&connection.DatasetCount,
			&wherobotsHost,
			&wherobotsKeyEncrypted,
			&wherobotsRegion,
			&wherobotsRuntime,
		)
		if err != nil {
			log.Fatal().Err(err).Msg("scan failed")
		}
		if isDefault {
			if lastDefaultIndex == -1 {
				lastDefaultIndex = len(connections)
			}
			// is_default is not a unique constraint, so there can be multiple default connections
			// this is design decision to avoid race conditions when updating default connection
			if lastDefault.Before(updatedAt) {
				lastDefault = updatedAt
				lastDefaultIndex = len(connections)
			}
		}
		connection.Id = ID.String
		connection.BigqueryProjectId = bigqueryProjectId.String
		connection.CloudStorageBucket = cloudStorageBucket.String
		connection.SnowflakeAccountId = snowflakeAccountID.String
		connection.SnowflakeUsername = snowflakeUsername.String
		connection.SnowflakeWarehouse = snowflakeWarehouse.String
		connection.SnowflakePassword = secrets.EncryptedToClient(snowflakePassword.String)
		connection.SnowflakeKey = secrets.EncryptedToClient(snowflakeKey.String)
		connection.BigqueryKey = secrets.EncryptedToClient(bigqueryKey.String)
		connection.UpdatedAt = updatedAt.Unix()
		connection.CreatedAt = createdAt.Unix()
		connection.WherobotsHost = wherobotsHost.String
		connection.WherobotsRegion = wherobotsRegion.String
		connection.WherobotsRuntime = wherobotsRuntime.String
		connection.WherobotsKey = secrets.EncryptedToClient(wherobotsKeyEncrypted.String)
		if connection.CloudStorageBucket != "" {
			connection.CanStoreFiles = true
		}
		connections = append(connections, &connection)
	}

	if lastDefaultIndex != -1 {
		connections[lastDefaultIndex].IsDefault = true
	} else if len(connections) > 0 {
		// if no default connection is set, set the first one as default
		connections[len(connections)-1].IsDefault = true
	}

	return connections, nil

}

func (s Server) SetDefaultConnection(ctx context.Context, req *proto.SetDefaultConnectionRequest) (*proto.SetDefaultConnectionResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	if checkWorkspace(ctx).UserRole != proto.UserRole_ROLE_ADMIN {
		return nil, status.Error(codes.PermissionDenied, "only admins can edit connections")
	}
	_, err := s.db.ExecContext(ctx,
		`update connections set
			is_default=true,
			updated_at=CURRENT_TIMESTAMP
		where id=$1`,
		req.ConnectionId,
	)
	if err != nil {
		errtype.LogError(err, "update connections failed")
		return nil, err
	}
	s.userStreams.PingAll()
	return &proto.SetDefaultConnectionResponse{}, nil
}

func (s Server) UpdateConnection(ctx context.Context, req *proto.UpdateConnectionRequest) (*proto.UpdateConnectionResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	if checkWorkspace(ctx).UserRole != proto.UserRole_ROLE_ADMIN {
		return nil, status.Error(codes.PermissionDenied, "only admins can edit connections")
	}

	err := conn.ValidateReqConnection(req.Connection)
	if err != nil {
		return nil, err
	}

	_, err = uuid.Parse(req.Connection.Id)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid connection id")
	}

	var res sql.Result

	if req.Connection.ConnectionType == proto.ConnectionType_CONNECTION_TYPE_SNOWFLAKE {
		res, err = s.db.ExecContext(ctx,
			`update connections set
				connection_name=$1,
				snowflake_account_id=$2,
				snowflake_username=$3,
				snowflake_warehouse=$4,
				updated_at=CURRENT_TIMESTAMP
			where id=$5`,
			req.Connection.ConnectionName,
			req.Connection.SnowflakeAccountId,
			req.Connection.SnowflakeUsername,
			req.Connection.SnowflakeWarehouse,
			req.Connection.Id,
		)
		snowflakeKey := secrets.SecretToServerEncrypted(req.Connection.SnowflakeKey, claims)
		if snowflakeKey != "" && err == nil {
			res, err = s.db.ExecContext(ctx,
				`update connections set
				snowflake_key_encrypted=$1
			where id=$2`,
				snowflakeKey,
				req.Connection.Id,
			)
		}
	} else if req.Connection.ConnectionType == proto.ConnectionType_CONNECTION_TYPE_WHEROBOTS {
		res, err = s.db.ExecContext(ctx,
			`update connections set
				connection_name=$1,
				wherobots_host=$2,
				wherobots_region=$3,
				wherobots_runtime=$4,
				updated_at=now()
			where id=$5`,
			req.Connection.ConnectionName,
			req.Connection.WherobotsHost,
			req.Connection.WherobotsRegion,
			req.Connection.WherobotsRuntime,
			req.Connection.Id,
		)
		// update key if it is provided
		wherobotsKey := secrets.SecretToServerEncrypted(req.Connection.WherobotsKey, claims)
		if wherobotsKey != "" && err == nil {
			res, err = s.db.ExecContext(ctx,
				`update connections set
				wherobots_key_encrypted=$1
			where id=$2`,
				wherobotsKey,
				req.Connection.Id,
			)
		}
	} else {
		res, err = s.db.ExecContext(ctx,
			`update connections set
			connection_name=$1,
			cloud_storage_bucket=$2,
			updated_at=CURRENT_TIMESTAMP
		where id=$3`,
			req.Connection.ConnectionName,
			req.Connection.CloudStorageBucket,
			req.Connection.Id,
		)
		if req.Connection.BigqueryProjectId != "" && err == nil {
			res, err = s.db.ExecContext(ctx,
				`update connections set
				bigquery_project_id=$1
			where id=$2`,
				req.Connection.BigqueryProjectId,
				req.Connection.Id,
			)
		}
		if req.Connection.BigqueryKey != nil && err == nil {
			res, err = s.db.ExecContext(ctx,
				`update connections set
				bigquery_key_encrypted=$1
			where id=$2`,
				secrets.SecretToServerEncrypted(req.Connection.BigqueryKey, claims),
				req.Connection.Id,
			)
		}
	}
	if err != nil {
		errtype.LogError(err, "update connections failed")
		return nil, err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		errtype.LogError(err, "rows affected failed")
		return nil, err
	}
	if rowsAffected == 0 {
		return nil, status.Error(codes.NotFound, "connection not found")
	}
	s.userStreams.PingAll()
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
		errtype.LogError(err, "select from reports failed")
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		reportID := sql.NullString{}
		err := rows.Scan(
			&reportID,
		)
		if err != nil {
			errtype.LogError(err, "scan failed")
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
	if checkWorkspace(ctx).UserRole != proto.UserRole_ROLE_ADMIN {
		return nil, status.Error(codes.PermissionDenied, "only admins can edit connections")
	}
	workspaceInfo := checkWorkspace(ctx)
	res, err := s.db.ExecContext(ctx,
		`update connections set
			archived=true,
			updated_at=CURRENT_TIMESTAMP
		where id=$1 and author_email=$2 and workspace_id=$3`,
		req.ConnectionId,
		claims.Email,
		workspaceInfo.ID,
	)
	if err != nil {
		errtype.LogError(err, "update connections failed")
		return nil, err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		errtype.LogError(err, "rows affected failed")
		return nil, err
	}
	if rowsAffected == 0 {
		return nil, status.Error(codes.NotFound, "connection not found")
	}
	reports, err := s.getReportsAffectedByConnectionArchive(ctx, req.ConnectionId)

	if err != nil {
		errtype.LogError(err, "getReportsAffectedByConnectionArchive failed")
		return nil, err
	}

	_, err = s.db.ExecContext(ctx,
		`update datasets set
			connection_id=null,
			updated_at=CURRENT_TIMESTAMP
		where connection_id=$1 and file_id is null and query_id is null`,
		req.ConnectionId,
	)

	if err != nil {
		errtype.LogError(err, "update datasets failed")
		return nil, err
	}

	s.userStreams.PingAll()
	s.reportStreams.PingAll(reports)
	return &proto.ArchiveConnectionResponse{}, nil
}

func (s Server) GetConnectionList(ctx context.Context, req *proto.GetConnectionListRequest) (*proto.GetConnectionListResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	connections := make([]*proto.Connection, 0)
	if checkWorkspace(ctx).ID != "" {
		// user connections stored in the workspace
		// default workspace and playground workspace do not have user connections
		userConnections, err := s.getUserConnections(ctx)
		if err != nil {
			errtype.LogError(err, "getConnections failed")
			return nil, status.Error(codes.Internal, err.Error())
		}
		connections = append(connections, userConnections...)
	}

	if os.Getenv("DEKART_CLOUD") != "" || os.Getenv("DEKART_DATASOURCE") != "USER" {
		// append system connection
		systemConnection, err := s.getConnection(ctx, conn.SystemConnectionID)
		if err != nil {
			errtype.LogError(err, "getConnection failed for system connection")
			return nil, status.Error(codes.Internal, err.Error())
		}
		if systemConnection != nil {
			// Create a new connection and copy only safe properties
			safeConn := &proto.Connection{
				Id:             systemConnection.Id,
				ConnectionName: systemConnection.ConnectionName,
				ConnectionType: systemConnection.ConnectionType,
				IsDefault:      systemConnection.IsDefault,
				CanStoreFiles:  systemConnection.CanStoreFiles,
			}
			connections = append(connections, safeConn)
		}

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
	var lastConnectionUpdate int64
	if IsSqlite() {
		var lastConnectionUpdateDate sql.NullString
		err := s.db.QueryRowContext(ctx,
			`SELECT MAX(updated_at) FROM (
            SELECT updated_at FROM connections
            UNION ALL
            SELECT updated_at FROM datasets
        ) AS combined`,
		).Scan(&lastConnectionUpdateDate)
		if err != nil {
			errtype.LogError(err, "failed to get last connection update (sqlite)")
			return 0, err
		}
		if !lastConnectionUpdateDate.Valid {
			return 0, nil // or any default value you prefer
		}
		// Parse SQLite timestamp (stored in UTC)
		lastConnectionUpdateDateParsed, err := time.ParseInLocation("2006-01-02 15:04:05", lastConnectionUpdateDate.String, time.UTC)
		if err != nil {
			errtype.LogError(err, "failed to parse connection update timestamp")
			return 0, err
		}
		lastConnectionUpdate = lastConnectionUpdateDateParsed.Unix()
	} else {
		var lastConnectionUpdateDate sql.NullTime
		err := s.db.QueryRowContext(ctx,
			`SELECT MAX(updated_at) FROM (
			SELECT updated_at FROM connections
			UNION ALL
			SELECT updated_at FROM datasets
		) AS combined`,
		).Scan(&lastConnectionUpdateDate)
		lastConnectionUpdate = lastConnectionUpdateDate.Time.Unix()
		if err != nil {
			errtype.LogError(err, "failed to get last connection update")
			return 0, err
		}
	}
	return lastConnectionUpdate, nil
}

func (s Server) CreateConnection(ctx context.Context, req *proto.CreateConnectionRequest) (*proto.CreateConnectionResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	if checkWorkspace(ctx).ID == "" {
		return nil, status.Error(codes.NotFound, "workspace not found")
	}
	if checkWorkspace(ctx).UserRole != proto.UserRole_ROLE_ADMIN {
		return nil, status.Error(codes.PermissionDenied, "only admins can create connections")
	}
	err := conn.ValidateReqConnection(req.Connection)
	if err != nil {
		return nil, err
	}

	id := newUUID()

	_, err = s.db.ExecContext(ctx,
		`INSERT INTO connections (
			id,
			connection_name,
			bigquery_project_id,
			cloud_storage_bucket,
			connection_type,
			snowflake_account_id,
			snowflake_username,
			snowflake_warehouse,
			snowflake_password_encrypted,
			snowflake_key_encrypted,
			bigquery_key_encrypted,
			author_email,
			workspace_id,
			wherobots_host,
			wherobots_key_encrypted,
			wherobots_region,
			wherobots_runtime
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
		id,
		req.Connection.ConnectionName,
		req.Connection.BigqueryProjectId,
		req.Connection.CloudStorageBucket,
		req.Connection.ConnectionType,
		req.Connection.SnowflakeAccountId,
		req.Connection.SnowflakeUsername,
		req.Connection.SnowflakeWarehouse,
		secrets.SecretToServerEncrypted(req.Connection.SnowflakePassword, claims),
		secrets.SecretToServerEncrypted(req.Connection.SnowflakeKey, claims),
		secrets.SecretToServerEncrypted(req.Connection.BigqueryKey, claims),
		claims.Email,
		checkWorkspace(ctx).ID,
		req.Connection.WherobotsHost,
		secrets.SecretToServerEncrypted(req.Connection.WherobotsKey, claims),
		req.Connection.WherobotsRegion,
		req.Connection.WherobotsRuntime,
	)
	if err != nil {
		errtype.LogError(err, "insert into connections failed")
		return nil, err
	}

	s.userStreams.PingAll()

	req.Connection.Id = id

	return &proto.CreateConnectionResponse{
		Connection: req.Connection,
	}, nil
}
