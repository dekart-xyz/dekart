package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/conn"
	"dekart/src/server/errtype"
	"dekart/src/server/notifications"
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

// getReportWithOptions returns report by id, checks if user has access to it
func (s Server) getReportWithOptions(ctx context.Context, reportID string, archived bool) (*proto.Report, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		log.Fatal().Msg("getReportWithOptions require claims")
		return nil, nil
	}
	reportRows, err := s.db.QueryContext(ctx,
		`select
			id,
			case when map_config is null then '' else map_config end as map_config,
			case when title is null then 'Untitled' else title end as title,
			author_email = $1 as is_author,
			author_email,
			discoverable,
			allow_edit,
			created_at,
			updated_at,
			is_playground,
			(
				select count(*) from connections as c
				join datasets as d on c.id=d.connection_id
				where d.report_id=$2 and cloud_storage_bucket is not null and (
					cloud_storage_bucket != ''
					or connection_type > 1 -- snowflake allows sharing without bucket
					or (bigquery_key_encrypted is not null and bigquery_key_encrypted != '') -- bigquery service account
				)
			) as connections_with_cache_num,
			(
				select count(*) from connections as c
				join datasets as d on c.id=d.connection_id
				where d.report_id=$3
			) as connections_num,
			(
				select count(*) from connections as c
				join datasets as d on c.id=d.connection_id
				where d.report_id=$4 and  connection_type <= 1 -- BigQuery
				and (c.bigquery_key_encrypted is null or c.bigquery_key_encrypted = '') -- BigQuery passthrough
			) as connections_with_sensitive_scope_num,
			is_public,
			track_viewers,
			query_params,
			allow_export,
			readme,
			workspace_id,
			auto_refresh_interval_seconds,
			version_id
		from reports as r
		where (id=$5) and (archived = $6)
		limit 1`,
		claims.Email,
		reportID,
		reportID, // sqlite does not support positional parameters reuse
		reportID,
		reportID,
		archived,
	)
	if err != nil {
		errtype.LogError(err, fmt.Sprintf("select from reports failed: workspace=%s reportID=%s", checkWorkspace(ctx).ID, reportID))
		return nil, err
	}
	defer reportRows.Close()
	report := &proto.Report{}

	for reportRows.Next() {
		createdAt := time.Time{}
		updatedAt := time.Time{}
		readme := sql.NullString{}
		reportWorkspaceID := sql.NullString{}
		var connectionsWithCacheNum, connectionsNum, connectionsWithSensitiveScopeNum int
		var queryParams []byte
		var versionID sql.NullString
		err = reportRows.Scan(
			&report.Id,
			&report.MapConfig,
			&report.Title,
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
			&report.TrackViewers,
			&queryParams,
			&report.AllowExport,
			&readme,
			&reportWorkspaceID,
			&report.AutoRefreshIntervalSeconds,
			&versionID,
		)
		if err != nil {
			errtype.LogError(err, "failed to scan report")
			return nil, err
		}
		report.CanWrite = report.IsAuthor || (report.AllowEdit && reportWorkspaceID.String == checkWorkspace(ctx).ID)

		if checkWorkspace(ctx).Expired {
			report.CanWrite = false
			report.AllowEdit = false
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
		report.IsSharable = (connectionsWithCacheNum == connectionsNum)

		if !conn.IsUserDefined() {
			// for configured connections, report is sharable if cloud storage bucket is set
			report.IsSharable = conn.CanShareReports()
		}
		report.NeedSensitiveScope = connectionsWithSensitiveScopeNum > 0
		if report.IsPublic && !report.CanWrite {
			// viewers of public reports don't need sensitive scope
			report.NeedSensitiveScope = false
		}
		report.Discoverable = (report.Discoverable &&
			report.IsSharable && // only sharable reports can be discoverable
			reportWorkspaceID.String == checkWorkspace(ctx).ID)

		report.CanRefresh = reportWorkspaceID.String == checkWorkspace(ctx).ID
		if checkWorkspace(ctx).Expired {
			report.CanRefresh = false
		}
		report.CreatedAt = createdAt.Unix()
		report.UpdatedAt = updatedAt.Unix()

		if versionID.Valid {
			report.VersionId = versionID.String
		}

		if readme.Valid {
			report.Readme = &proto.Readme{
				Markdown: readme.String,
			}
		}

		//query params
		if len(queryParams) > 0 {
			err = json.Unmarshal(queryParams, &report.QueryParams)
			if err != nil {
				errtype.LogError(err, "failed to unmarshal query params")
				return nil, err
			}
		}
	}
	if report.Id != "" {
		directAccessEmails, err := s.getDirectAccessEmails(ctx, report.Id)
		if err != nil {
			errtype.LogError(err, "getDirectAccessEmails failed")
			return nil, status.Error(codes.Internal, err.Error())
		}
		if len(directAccessEmails) > 0 {
			report.HasDirectAccess = true
		}
		if report.Discoverable || report.IsAuthor || report.IsPlayground || report.IsPublic {
			// report is discoverable by others in workspace
			return report, nil
		}
		if report.IsSharable {
			for _, email := range directAccessEmails {
				if email == claims.Email {
					return report, nil // user has direct access to the report
				}
			}
		}
	}
	return nil, nil // not found
}

// getReport returns report by id, checks if user has access to it
// Excludes archived reports for backward compatibility
func (s Server) getReport(ctx context.Context, reportID string) (*proto.Report, error) {
	return s.getReportWithOptions(ctx, reportID, false)
}

// CreateReport implementation
func (s Server) CreateReport(ctx context.Context, req *proto.CreateReportRequest) (*proto.CreateReportResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	workspaceInfo := checkWorkspace(ctx)
	if workspaceInfo.ID == "" && !workspaceInfo.IsPlayground {
		return nil, status.Error(codes.NotFound, "Workspace not found")
	}
	if workspaceInfo.Expired {
		return nil, status.Error(codes.PermissionDenied, "workspace is read-only")
	}
	if workspaceInfo.UserRole == proto.UserRole_ROLE_VIEWER {
		return nil, status.Error(codes.PermissionDenied, "Only admins and editors can create reports")
	}
	id := newUUID()
	var err error
	if workspaceInfo.IsPlayground {
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
			workspaceInfo.ID,
		)

	}
	if err != nil {
		errtype.LogError(err, "database operation failed")
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

	// Validate map config size to prevent gRPC message size errors
	if len(report.MapConfig) > MaxMapConfigSize {
		log.Warn().
			Str("reportId", report.Id).
			Str("authorEmail", claims.Email).
			Int("mapConfigSize", len(report.MapConfig)).
			Int("maxAllowed", MaxMapConfigSize).
			Msg("Map configuration too large during fork")
		return status.Errorf(codes.InvalidArgument,
			"Map configuration is too large (%d bytes). Maximum allowed size is %d bytes. Please simplify your map configuration.",
			len(report.MapConfig), MaxMapConfigSize)
	}

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
			errtype.LogError(err, "database operation failed")
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
				log.Warn().Err(err).Send()
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
						log.Warn().Err(err).Send()
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
				log.Warn().Err(err).Send()
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
			log.Warn().Err(err).Send()
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
	workspaceInfo := checkWorkspace(ctx)
	isPlayground := workspaceInfo.IsPlayground
	workspaceID := workspaceInfo.ID
	if workspaceID == "" && !isPlayground {
		return nil, status.Error(codes.NotFound, "Workspace not found")
	}
	if workspaceInfo.Expired {
		return nil, status.Error(codes.PermissionDenied, "workspace is read-only")
	}
	if workspaceInfo.UserRole == proto.UserRole_ROLE_VIEWER {
		return nil, status.Error(codes.PermissionDenied, "Only admins and editors can fork reports")
	}
	_, err := uuid.Parse(req.ReportId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	newReportID := newUUID()

	report, err := s.getReport(ctx, req.ReportId)
	if err != nil {
		errtype.LogError(err, "database operation failed")
		return nil, err
	}
	if report == nil {
		err := fmt.Errorf("report %s not found", newReportID)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}
	if isPlayground && !report.IsPlayground {
		// cannot fork non-playground report in playground
		return nil, status.Error(codes.PermissionDenied, "Cannot fork non-playground report in playground")
	}

	report.Id = newReportID
	report.Title = fmt.Sprintf("Fork of %s", report.Title)

	datasets, err := s.getDatasets(ctx, req.ReportId)
	if err != nil {
		errtype.LogError(err, "Cannot retrieve datasets")
		return nil, err
	}
	connectionUpdated := false

	// we need to replace connection ids with the user connections ids when
	// forking a public report
	// or when forking a playground report in workspace
	if report.IsPublic || (report.IsPlayground && !isPlayground) {
		userConnections, err := s.getUserConnections(ctx)
		if err != nil {
			errtype.LogError(err, "Cannot retrieve connections")
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
				if connection.ConnectionType == dataset.ConnectionType {
					newConnectionID = connection.Id
				}
			}
			if newConnectionID == "" && dataset.ConnectionId != "" {
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
			errtype.LogError(err, "Cannot retrieve query jobs")
			return nil, err
		}
	}

	err = s.commitReportWithDatasets(ctx, report, datasets, jobs)
	if err != nil {
		errtype.LogError(err, "database operation failed")
		return nil, err
	}

	return &proto.ForkReportResponse{
		ReportId: newReportID,
	}, nil
}

func (s Server) SetAutoRefreshIntervalSeconds(ctx context.Context, req *proto.SetAutoRefreshIntervalSecondsRequest) (*proto.SetAutoRefreshIntervalSecondsResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	workspaceInfo := checkWorkspace(ctx)
	if workspaceInfo.Expired {
		return nil, status.Error(codes.PermissionDenied, "workspace is read-only")
	}
	_, err := uuid.Parse(req.ReportId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
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
		err := fmt.Errorf("cannot set auto refresh interval seconds for report %s", req.ReportId)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.PermissionDenied, "Cannot set auto refresh interval seconds")
	}
	if req.AutoRefreshIntervalSeconds > 0 && req.AutoRefreshIntervalSeconds < 30 {
		return nil, status.Error(codes.InvalidArgument, "Auto refresh interval seconds must be greater than 0 and less than 30")
	}
	if req.AutoRefreshIntervalSeconds < 0 {
		return nil, status.Error(codes.InvalidArgument, "Auto refresh interval seconds must be greater than 0")
	}
	_, err = s.db.ExecContext(ctx,
		`update reports set auto_refresh_interval_seconds=$1 where id=$2`,
		req.AutoRefreshIntervalSeconds,
		req.ReportId,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	s.reportStreams.Ping(req.ReportId)
	return &proto.SetAutoRefreshIntervalSecondsResponse{}, nil
}

// UpdateReport implementation
func (s Server) UpdateReport(ctx context.Context, req *proto.UpdateReportRequest) (*proto.UpdateReportResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	workspaceInfo := checkWorkspace(ctx)
	if workspaceInfo.Expired {
		return nil, status.Error(codes.PermissionDenied, "workspace is read-only")
	}
	_, err := uuid.Parse(req.ReportId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
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

	// Validate map config size to prevent gRPC message size errors
	if len(req.MapConfig) > MaxMapConfigSize {
		log.Warn().
			Str("reportId", req.ReportId).
			Str("authorEmail", claims.Email).
			Int("mapConfigSize", len(req.MapConfig)).
			Int("maxAllowed", MaxMapConfigSize).
			Msg("Map configuration too large")
		return nil, status.Errorf(codes.InvalidArgument,
			"Map configuration is too large (%d bytes). Maximum allowed size is %d bytes. Please simplify your map configuration.",
			len(req.MapConfig), MaxMapConfigSize)
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
	updated_at := time.Now()
	if workspaceInfo.IsPlayground {
		result, err = s.db.ExecContext(ctx,
			`update
			reports
		set map_config=$1, title=$2, query_params=$3, readme=$4, updated_at=$5
		where id=$6 and author_email=$7 and is_playground=true`,
			req.MapConfig,
			req.Title,
			string(paramsJSON),
			readme,
			updated_at,
			req.ReportId,
			claims.Email,
		)
	} else {
		result, err = s.db.ExecContext(ctx,
			`update
			reports
		set map_config=$1, title=$2, query_params=$3, readme=$4, updated_at=$5
		where id=$6 and (author_email=$7 or allow_edit) and workspace_id=$8`,
			req.MapConfig,
			req.Title,
			string(paramsJSON),
			readme,
			updated_at,
			req.ReportId,
			claims.Email,
			workspaceInfo.ID,
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
		_, err := s.storeQuerySync(ctx, query.Id, query.QueryText)
		if err != nil {
			if _, ok := err.(*queryWasNotUpdated); ok {
				log.Warn().Str("queryId", query.Id).Msg("Query text not updated")
			} else {
				errtype.LogError(err, "Error storing query")
				return nil, status.Error(codes.Internal, err.Error())
			}
		}
	}

	defer s.reportStreams.Ping(req.ReportId)

	return &proto.UpdateReportResponse{
		UpdatedAt: updated_at.Unix(),
	}, nil
}

func (s Server) AllowExportDatasets(ctx context.Context, req *proto.AllowExportDatasetsRequest) (*proto.AllowExportDatasetsResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	_, err := uuid.Parse(req.ReportId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
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

// SetTrackViewers toggles tracking viewers for a report
func (s Server) SetTrackViewers(ctx context.Context, req *proto.SetTrackViewersRequest) (*proto.SetTrackViewersResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	_, err := uuid.Parse(req.ReportId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
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
		err := fmt.Errorf("cannot set track_viewers for report %s", req.ReportId)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.PermissionDenied, "Cannot set track viewers")
	}

	_, err = s.db.ExecContext(ctx,
		`update reports set track_viewers=$1 where id=$2`,
		req.TrackViewers,
		req.ReportId,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	s.reportStreams.Ping(req.ReportId)
	return &proto.SetTrackViewersResponse{}, nil
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
		return nil, status.Error(codes.InvalidArgument, err.Error())
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
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	// Use getReportWithOptions to include archived reports (needed for unarchiving)
	report, err := s.getReportWithOptions(ctx, req.ReportId, !req.Archive)
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
		err := fmt.Errorf("cannot archive report %s", req.ReportId)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.PermissionDenied, "Cannot archive report")
	}

	if req.Archive && report.IsPublic {
		err := fmt.Errorf("cannot archive public report %s", req.ReportId)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.InvalidArgument, "Cannot archive public report")
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

func (s Server) getDirectAccessEmails(ctx context.Context, reportID string) ([]string, error) {
	// Get the latest access log entries for the report
	rows, err := s.db.QueryContext(ctx, `
		SELECT email
		FROM (
			SELECT email, access_level, status,
				ROW_NUMBER() OVER (PARTITION BY email ORDER BY created_at DESC) as rn
			FROM report_access_log
			WHERE report_id = $1
		) t
		WHERE rn = 1 AND status != 2
	`, reportID)
	if err != nil {
		errtype.LogError(err, "database operation failed")
		return nil, err
	}
	defer rows.Close()

	emails := make([]string, 0)
	for rows.Next() {
		var email string
		if err := rows.Scan(&email); err != nil {
			log.Err(err).Send()
			return nil, err
		}
		emails = append(emails, email)
	}
	return emails, nil
}

// AddReportDirectAccess adds direct access for the report
func (s Server) AddReportDirectAccess(ctx context.Context, req *proto.AddReportDirectAccessRequest) (*proto.AddReportDirectAccessResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	reportID := req.ReportId
	emails := req.Emails

	// Validate report ID
	_, err := uuid.Parse(reportID)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
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
		err := fmt.Errorf("cannot add direct access for report %s", req.ReportId)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.PermissionDenied, "Cannot add direct access")
	}

	// Start transaction
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	defer func() {
		if err != nil {
			rollback(tx)
		}
	}()

	// Derive current access state from the latest log entries
	// Only include emails whose latest entry is not a removal (status != 2)
	rows, err := tx.QueryContext(ctx, `
		SELECT email, access_level
		FROM (
			SELECT email, access_level, status,
				ROW_NUMBER() OVER (PARTITION BY email ORDER BY created_at DESC) as rn
			FROM report_access_log
			WHERE report_id = $1
		) t
		WHERE rn = 1 AND status != 2
	`, reportID)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	defer rows.Close()

	currentAccess := make(map[string]int)
	for rows.Next() {
		var email string
		var accessLevel int
		if err := rows.Scan(&email, &accessLevel); err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}
		currentAccess[email] = accessLevel
	}

	// Build set of requested emails for view access (level 1)
	requested := make(map[string]int)
	for _, email := range emails {
		requested[email] = 1
	}

	// Compute users to add/change and remove
	toAddOrUpdate := make(map[string]int)
	for email, level := range requested {
		if curLevel, ok := currentAccess[email]; !ok || curLevel != level {
			toAddOrUpdate[email] = level
		}
	}
	toRemove := make([]string, 0)
	for email := range currentAccess {
		if _, ok := requested[email]; !ok {
			toRemove = append(toRemove, email)
		}
	}

	notificationPayloads := make([]notifications.ReportAccessGranted, 0, len(toAddOrUpdate))

	// Apply additions
	for email, level := range toAddOrUpdate {
		_, err = tx.ExecContext(ctx, `
			INSERT INTO report_access_log (report_id, email, status, access_level, authored_by)
			VALUES ($1, $2, 1, $3, $4)
		`, reportID, email, level, claims.Email)
		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}
		notificationPayloads = append(notificationPayloads, notifications.ReportAccessGranted{
			ReportID:       reportID,
			ReportTitle:    report.Title,
			RecipientEmail: email,
			GrantedByEmail: claims.Email,
			AccessLevel:    level,
		})
	}

	// Apply removals
	for _, email := range toRemove {
		_, err = tx.ExecContext(ctx, `
			INSERT INTO report_access_log (report_id, email, status, access_level, authored_by)
			VALUES ($1, $2, 2, 0, $3)
		`, reportID, email, claims.Email)
		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}
	}

	err = tx.Commit()
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	defer s.reportStreams.Ping(req.ReportId)

	for _, notificationPayload := range notificationPayloads {
		go s.notifications.SendReportAccessGranted(notificationPayload)
	}

	return &proto.AddReportDirectAccessResponse{}, nil
}
