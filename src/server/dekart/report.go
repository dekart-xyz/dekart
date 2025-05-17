package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/conn"
	"dekart/src/server/user"
	"encoding/json"
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

// getReport returns report by id, checks if user has access to it
func (s Server) getReport(ctx context.Context, reportID string) (*proto.Report, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		log.Fatal().Msg("getReport require claims")
		return nil, nil
	}
	var reportRows *sql.Rows
	var err error
	if checkWorkspace(ctx).ID == "" {
		reportRows, err = s.db.QueryContext(ctx,
			`select
			id,
			case when map_config is null then '' else map_config end as map_config,
			case when title is null then 'Untitled' else title end as title,
			(author_email = $1) or allow_edit as can_write,
			author_email = $2 as is_author,
			author_email,
			discoverable,
			allow_edit,
			created_at,
			updated_at,
			is_playground,
			0 as connections_with_cache_num,
			0 as connections_num,
			0 as connections_with_sensitive_scope_num,
			is_public,
			query_params,
			allow_export,
			readme
		from reports as r
		where id=$3 and not archived and (is_playground or is_public)
		limit 1`,
			claims.Email,
			claims.Email, // sqlite does not support positional parameters reuse
			reportID,
		)
	} else {
		reportRows, err = s.db.QueryContext(ctx,
			`select
			id,
			case when map_config is null then '' else map_config end as map_config,
			case when title is null then 'Untitled' else title end as title,
			(author_email = $1) or allow_edit as can_write,
			author_email = $2 as is_author,
			author_email,
			discoverable,
			allow_edit,
			created_at,
			updated_at,
			is_playground,
			(
				select count(*) from connections as c
				join datasets as d on c.id=d.connection_id
				where d.report_id=$3 and cloud_storage_bucket is not null and (
					cloud_storage_bucket != ''
					or connection_type > 1 -- snowflake allows sharing without bucket
					or (bigquery_key_encrypted is not null and bigquery_key_encrypted != '') -- bigquery service account
				)
			) as connections_with_cache_num,
			(
				select count(*) from connections as c
				join datasets as d on c.id=d.connection_id
				where d.report_id=$4
			) as connections_num,
			(
				select count(*) from connections as c
				join datasets as d on c.id=d.connection_id
				where d.report_id=$5 and  connection_type <= 1 -- BigQuery
				and (c.bigquery_key_encrypted is null or c.bigquery_key_encrypted = '') -- BigQuery passthrough
			) as connections_with_sensitive_scope_num,
			is_public,
			query_params,
			allow_export,
			readme
		from reports as r
		where (id=$6) and (not archived) and ((workspace_id=$7) or is_playground or is_public)
		limit 1`,
			claims.Email,
			claims.Email,
			reportID,
			reportID, // sqlite does not support positional parameters reuse
			reportID,
			reportID,
			checkWorkspace(ctx).ID,
		)
	}
	if err != nil {
		log.Err(err).Str("workspace", checkWorkspace(ctx).ID).Str("reportID", reportID).Send()
		return nil, err
	}
	defer reportRows.Close()
	report := &proto.Report{}

	for reportRows.Next() {
		createdAt := time.Time{}
		updatedAt := time.Time{}
		readme := sql.NullString{}
		var connectionsWithCacheNum, connectionsNum, connectionsWithSensitiveScopeNum int
		var queryParams []byte
		err = reportRows.Scan(
			&report.Id,
			&report.MapConfig,
			&report.Title,
			&report.CanWrite,
			&report.IsAuthor,
			&report.AuthorEmail,
			&report.Discoverable,
			&report.AllowEdit,
			&createdAt,
			&updatedAt,
			&report.IsPlayground,
			&connectionsWithCacheNum,
			&connectionsNum,
			&connectionsWithSensitiveScopeNum,
			&report.IsPublic,
			&queryParams,
			&report.AllowExport,
			&readme,
		)
		if err != nil {
			log.Err(err).Send()
			return nil, err
		}
		if report.IsPlayground && !checkWorkspace(ctx).IsPlayground {
			// report is playground but user is not in playground
			report.AllowEdit = false
			report.CanWrite = false
		}
		if checkWorkspace(ctx).UserRole == proto.UserRole_ROLE_VIEWER {
			// viewer cannot edit reports
			report.AllowEdit = false
			report.CanWrite = false
		}
		// report is sharable if all connections have cache
		report.IsSharable = (connectionsNum > 0 && connectionsWithCacheNum == connectionsNum)

		if !conn.IsUserDefined() {
			// for configured connections, report is sharable if cloud storage bucket is set
			report.IsSharable = conn.CanShareReports()
		}

		report.NeedSensitiveScope = connectionsWithSensitiveScopeNum > 0
		report.Discoverable = report.Discoverable && report.IsSharable // only sharable reports can be discoverable

		report.CreatedAt = createdAt.Unix()
		report.UpdatedAt = updatedAt.Unix()

		if readme.Valid {
			report.Readme = &proto.Readme{
				Markdown: readme.String,
			}
		}

		//query params
		if len(queryParams) > 0 {
			err = json.Unmarshal(queryParams, &report.QueryParams)
			if err != nil {
				log.Err(err).Send()
				return nil, err
			}
		}
	}
	if report.Id == "" || // no report found
		(!report.Discoverable && !report.IsAuthor && !report.IsPlayground && !report.IsPublic) { // report is not discoverable by others in workspace
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
	if checkWorkspace(ctx).ID == "" && !checkWorkspace(ctx).IsPlayground {
		return nil, status.Error(codes.NotFound, "Workspace not found")
	}
	log.Debug().Interface("workspace", checkWorkspace(ctx)).Msg("CreateReport")
	if checkWorkspace(ctx).UserRole == proto.UserRole_ROLE_VIEWER {
		return nil, status.Error(codes.PermissionDenied, "Only admins and editors can create reports")
	}
	id := newUUID()
	var err error
	if checkWorkspace(ctx).IsPlayground {
		_, err = s.db.ExecContext(ctx,
			"INSERT INTO reports (id, author_email, is_playground) VALUES ($1, $2, true)",
			id,
			claims.Email,
		)
	} else {
		_, err = s.db.ExecContext(ctx,
			"INSERT INTO reports (id, author_email, workspace_id) VALUES ($1, $2, $3)",
			id,
			claims.Email,
			checkWorkspace(ctx).ID,
		)

	}
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

func (s Server) commitReportWithDatasets(ctx context.Context, report *proto.Report, datasets []*proto.Dataset, jobs []*proto.QueryJob) error {
	claims := user.GetClaims(ctx)
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{})
	if err != nil {
		return err
	}
	newMapConfig, newDatasetIds := updateDatasetIds(report, datasets)
	var paramsJSON []byte
	if report.QueryParams != nil {
		var err error
		paramsJSON, err = json.Marshal(report.QueryParams)
		if err != nil {
			log.Err(err).Send()
			return err
		}
	}

	var readme sql.NullString
	if report.Readme != nil {
		readme = sql.NullString{
			String: report.Readme.Markdown,
			Valid:  true,
		}
	} else {
		readme = sql.NullString{
			Valid: false,
		}
	}

	if checkWorkspace(ctx).IsPlayground {
		_, err = tx.ExecContext(ctx,
			"INSERT INTO reports (id, author_email, map_config, title, query_params, is_playground, readme) VALUES ($1, $2, $3, $4, $5, true, $6)",
			report.Id,
			claims.Email,
			newMapConfig,
			report.Title,
			paramsJSON,
			readme,
		)
	} else {
		_, err = tx.ExecContext(ctx,
			"INSERT INTO reports (id, author_email, map_config, title, query_params, is_public, workspace_id, readme) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
			report.Id,
			claims.Email,
			newMapConfig,
			report.Title,
			paramsJSON,
			report.IsPublic,
			checkWorkspace(ctx).ID,
			readme,
		)
	}
	if err != nil {
		rollback(tx)
		return err
	}
	for i, dataset := range datasets {
		datasetId := newDatasetIds[i]
		var connectionId *string
		if dataset.ConnectionId != "" {
			connectionId = &dataset.ConnectionId
		}
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
			// iterate over query jobs and insert new query jobs with new query id and new id
			for _, job := range jobs {
				if job.QueryId == dataset.QueryId {
					_, err = tx.ExecContext(ctx,
						`INSERT INTO query_jobs (
							id,
							query_id,
							job_status,
							query_params_hash,
							dw_job_id,
							job_result_id,
							job_error
						) select
							$1,
							$2,
							job_status,
							query_params_hash,
							dw_job_id,
							job_result_id,
							job_error
						from query_jobs where id=$3`,
						newUUID(),
						newQueryID,
						job.Id,
					)
					if err != nil {
						log.Debug().Err(err).Send()
						rollback(tx)
						return err
					}
				}
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
			INSERT INTO datasets (id, report_id, query_id, file_id, name, connection_id)
			VALUES($1, $2, $3, $4, $5, $6)`,
			datasetId,
			report.Id,
			queryId,
			fileId,
			dataset.Name,
			connectionId,
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
	isPlayground := checkWorkspace(ctx).IsPlayground
	workspaceID := checkWorkspace(ctx).ID
	if workspaceID == "" && !isPlayground {
		return nil, status.Error(codes.NotFound, "Workspace not found")
	}
	if checkWorkspace(ctx).UserRole == proto.UserRole_ROLE_VIEWER {
		return nil, status.Error(codes.PermissionDenied, "Only admins and editors can fork reports")
	}
	_, err := uuid.Parse(req.ReportId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, err.Error())
	}

	newReportID := newUUID()

	report, err := s.getReport(ctx, req.ReportId)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	if report == nil {
		err := fmt.Errorf("report %s not found", newReportID)
		log.Warn().Err(err).Send()
		return nil, status.Errorf(codes.NotFound, err.Error())
	}
	if isPlayground && !report.IsPlayground {
		// cannot fork non-playground report in playground
		return nil, status.Error(codes.PermissionDenied, "Cannot fork non-playground report in playground")
	}

	report.Id = newReportID
	report.Title = fmt.Sprintf("Fork of %s", report.Title)

	datasets, err := s.getDatasets(ctx, req.ReportId)
	if err != nil {
		log.Err(err).Msg("Cannot retrieve datasets")
		return nil, err
	}
	connectionUpdated := false

	// we need to replace connection ids with the user connections ids when
	// forking a public report
	// or when forking a playground report in workspace
	if report.IsPublic || (report.IsPlayground && !isPlayground) {
		userConnections, err := s.getUserConnections(ctx)
		if err != nil {
			log.Err(err).Msg("Cannot retrieve connections")
			return nil, err
		}
		// replace dataset connection ids with new connection ids with same connection type
		for _, dataset := range datasets {
			var newConnectionID string
			for _, connection := range userConnections {
				if dataset.ConnectionId == connection.Id {
					newConnectionID = connection.Id
					break
				}
				if connection.ConnectionType == dataset.ConnectionType ||
					(report.IsPlayground && connection.ConnectionType == proto.ConnectionType_CONNECTION_TYPE_BIGQUERY) {
					// for playground reports we can use any bigquery connection
					newConnectionID = connection.Id
				}
			}
			if newConnectionID == "" {
				log.Error().Msg("Connection not found")
				return nil, status.Error(codes.NotFound, "Connection not found")
			}
			if newConnectionID != dataset.ConnectionId {
				connectionUpdated = true
			}
			dataset.ConnectionId = newConnectionID
		}
	}
	var jobs []*proto.QueryJob
	if !connectionUpdated {
		// copy query jobs only if user has access to the connection
		jobs, err = s.getDatasetsQueryJobs(ctx, datasets)
		if err != nil {
			log.Err(err).Msg("Cannot retrieve query jobs")
			return nil, err
		}
	}

	err = s.commitReportWithDatasets(ctx, report, datasets, jobs)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}

	return &proto.ForkReportResponse{
		ReportId: newReportID,
	}, nil
}

// UpdateReport implementation
func (s Server) UpdateReport(ctx context.Context, req *proto.UpdateReportRequest) (*proto.UpdateReportResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	if checkWorkspace(ctx).UserRole == proto.UserRole_ROLE_VIEWER {
		return nil, status.Error(codes.PermissionDenied, "Only admins and editors can update reports")
	}
	var paramsJSON []byte
	if req.QueryParams != nil {
		var err error
		paramsJSON, err = json.Marshal(req.QueryParams)
		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.InvalidArgument, err.Error())
		}
	}

	var readme sql.NullString
	if req.Readme != nil {
		readme = sql.NullString{
			String: req.Readme.Markdown,
			Valid:  true,
		}
	} else {
		readme = sql.NullString{
			Valid: false,
		}
	}

	var result sql.Result
	var err error
	if checkWorkspace(ctx).IsPlayground {
		result, err = s.db.ExecContext(ctx,
			`update
			reports
		set map_config=$1, title=$2, query_params=$3, readme=$4
		where id=$5 and author_email=$6 and is_playground=true`,
			req.MapConfig,
			req.Title,
			string(paramsJSON),
			readme,
			req.ReportId,
			claims.Email,
		)
	} else {
		result, err = s.db.ExecContext(ctx,
			`update
			reports
		set map_config=$1, title=$2, query_params=$3, readme=$4
		where id=$5 and (author_email=$6 or allow_edit) and workspace_id=$7`,
			req.MapConfig,
			req.Title,
			string(paramsJSON),
			readme,
			req.ReportId,
			claims.Email,
			checkWorkspace(ctx).ID,
		)
	}
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
		err := fmt.Errorf("report not found id:%s", req.ReportId)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}

	// save queries
	for _, query := range req.Query {
		go s.storeQuery(ctx, req.ReportId, query.Id, query.QueryText, query.QuerySourceId)
	}

	s.reportStreams.Ping(req.ReportId)

	return &proto.UpdateReportResponse{}, nil
}

func (s Server) AllowExportDatasets(ctx context.Context, req *proto.AllowExportDatasetsRequest) (*proto.AllowExportDatasetsResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	_, err := uuid.Parse(req.ReportId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, err.Error())
	}
	report, err := s.getReport(ctx, req.ReportId)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	if report == nil {
		err := fmt.Errorf("report not found id:%s", req.ReportId)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}
	if !report.CanWrite {
		err := fmt.Errorf("cannot allow export for report %s", req.ReportId)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.PermissionDenied, "Cannot allow export")
	}
	_, err = s.db.ExecContext(ctx,
		`update reports set allow_export=$1 where id=$2`,
		req.AllowExport,
		req.ReportId,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	s.reportStreams.Ping(req.ReportId)
	return &proto.AllowExportDatasetsResponse{}, nil
}

func (s Server) SetDiscoverable(ctx context.Context, req *proto.SetDiscoverableRequest) (*proto.SetDiscoverableResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	if checkWorkspace(ctx).ID == "" {
		log.Warn().Msg("Workspace not found")
		return nil, status.Error(codes.NotFound, "Workspace not found")
	}
	_, err := uuid.Parse(req.ReportId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, err.Error())
	}
	report, err := s.getReport(ctx, req.ReportId)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	if report == nil {
		err := fmt.Errorf("report not found id:%s", req.ReportId)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}
	if !report.IsAuthor {
		err := fmt.Errorf("cannot set discoverable for report %s", req.ReportId)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.PermissionDenied, "Cannot set discoverable")
	}
	res, err := s.db.ExecContext(ctx,
		`update reports set discoverable=$1, allow_edit=$2 where id=$3 and author_email=$4 and workspace_id=$5`,
		req.Discoverable,
		req.AllowEdit,
		req.ReportId,
		claims.Email,
		checkWorkspace(ctx).ID,
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
	var result sql.Result
	if checkWorkspace(ctx).IsPlayground {
		result, err = s.db.ExecContext(ctx,
			"update reports set archived=$1 where id=$2 and author_email=$3 and is_playground=true",
			req.Archive,
			req.ReportId,
			claims.Email,
		)
	} else {
		result, err = s.db.ExecContext(ctx,
			"update reports set archived=$1 where id=$2 and author_email=$3 and workspace_id=$4",
			req.Archive,
			req.ReportId,
			claims.Email,
			checkWorkspace(ctx).ID,
		)
	}
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
