package dekart

import (
	"context"
	"crypto/md5"
	"crypto/sha1"
	"database/sql"
	"dekart/src/server/bqutils"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	"dekart/src/proto"
	"dekart/src/server/conn"
	"dekart/src/server/errtype"
	"dekart/src/server/query"
	"dekart/src/server/storage"
	"dekart/src/server/user"

	"cloud.google.com/go/bigquery"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type createQueryValidator func(context.Context, *proto.CreateQueryRequest) error

// ensureSavedDuckDBJobs accepts one consistent saved graph for Run All.
func (s Server) ensureSavedDuckDBJobs(ctx context.Context, reportID, queryParamsHash string, acceptedJobsByDatasetID map[string]*proto.QueryJob) error {
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := lockReportTx(ctx, tx, reportID); err != nil {
		return err
	}
	_, err = s.reconcileDuckDBGraphTx(ctx, tx, reportID, queryParamsHash, nil, "", acceptedJobsByDatasetID)
	if err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.reportStreams.Ping(reportID)
	return nil
}

// CreateQuery in dataset
func (s Server) CreateQuery(ctx context.Context, req *proto.CreateQueryRequest) (*proto.CreateQueryResponse, error) {
	return s.createQuery(ctx, req, nil)
}

func (s Server) createDatasetQueryRecord(ctx context.Context, reportID string, datasetID string, connectionID string, executionEngine proto.QueryExecutionEngine, changedBy string) (string, bool, error) {
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{})
	if err != nil {
		return "", false, err
	}
	defer tx.Rollback()
	if err := lockReportTx(ctx, tx, reportID); err != nil {
		return "", false, err
	}

	queryID := newUUID()
	_, err = tx.ExecContext(ctx,
		`insert into queries (
			id, query_text, query_source_id, query_source,
			duckdb_dependency_dataset_ids, duckdb_validation_error, execution_engine
		) values ($1, '', 'da39a3ee5e6b4b0d3255bfef95601890afd80709', $2, '[]', '', $3)`,
		queryID,
		proto.Query_QUERY_SOURCE_INLINE,
		executionEngine,
	)
	if err != nil {
		return "", false, err
	}

	update := `update datasets set
		connection_id=$1, query_id=$2, updated_at=CURRENT_TIMESTAMP
		where id=$3 and query_id is null`
	if executionEngine == proto.QueryExecutionEngine_QUERY_EXECUTION_ENGINE_DUCKDB {
		update += ` and file_id is null`
	}
	connectionValue := conn.ConnectionIDToNullString(connectionID)
	if executionEngine == proto.QueryExecutionEngine_QUERY_EXECUTION_ENGINE_DUCKDB {
		connectionValue = sql.NullString{}
	}
	result, err := tx.ExecContext(ctx, update, connectionValue, queryID, datasetID)
	if err != nil {
		return "", false, err
	}
	affectedRows, err := result.RowsAffected()
	if err != nil {
		return "", false, err
	}
	if affectedRows == 0 {
		var existingQueryID, fileID, existingConnectionID sql.NullString
		var existingExecutionEngine sql.NullInt32
		if err := tx.QueryRowContext(ctx,
			`select d.query_id, d.file_id, d.connection_id, q.execution_engine
			from datasets d left join queries q on q.id=d.query_id where d.id=$1`,
			datasetID,
		).Scan(&existingQueryID, &fileID, &existingConnectionID, &existingExecutionEngine); err != nil {
			return "", false, err
		}
		if existingQueryID.Valid {
			// Idempotent query creation is valid only for the same engine and connection binding.
			if !existingExecutionEngine.Valid ||
				proto.QueryExecutionEngine(existingExecutionEngine.Int32) != executionEngine ||
				existingConnectionID.Valid != connectionValue.Valid ||
				(existingConnectionID.Valid && existingConnectionID.String != connectionValue.String) {
				return "", false, status.Error(codes.AlreadyExists, "dataset already has a query with a different execution binding")
			}
			return existingQueryID.String, false, nil
		}
		if executionEngine == proto.QueryExecutionEngine_QUERY_EXECUTION_ENGINE_DUCKDB && fileID.Valid {
			return "", false, status.Error(codes.InvalidArgument, "DuckDB query cannot use a file-backed dataset")
		}
		return "", false, fmt.Errorf("dataset query was not created id:%s", datasetID)
	}
	versionID := newUUID()
	if _, err := tx.ExecContext(ctx, `update reports set version_id=$1 where id=$2`, versionID, reportID); err != nil {
		return "", false, err
	}
	if err := s.createReportSnapshotWithVersionIDTx(
		ctx,
		tx,
		versionID,
		reportID,
		changedBy,
		proto.ReportSnapshot_TRIGGER_TYPE_QUERY_CHANGE,
	); err != nil {
		return "", false, err
	}
	if err := tx.Commit(); err != nil {
		return "", false, err
	}
	return queryID, true, nil
}

func (s Server) createQuery(ctx context.Context, req *proto.CreateQueryRequest, validate createQueryValidator) (*proto.CreateQueryResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	if err := validateUUIDField(req.GetDatasetId(), "dataset_id"); err != nil {
		return nil, err
	}
	reportID, err := s.getReportID(ctx, req.DatasetId, true)

	if err != nil {
		errtype.LogError(err, "Error getting report ID")
		return nil, status.Error(codes.Internal, err.Error())
	}

	if reportID == nil {
		err := fmt.Errorf("dataset not found or permission not granted")
		log.Warn().Err(err).Str("dataset_id", req.DatasetId).Msg("Dataset not found")
		return nil, status.Error(codes.NotFound, err.Error())
	}
	if err := s.requireReportWorkspaceWrite(ctx, *reportID); err != nil {
		return nil, err
	}
	if validate != nil {
		if err := validate(ctx, req); err != nil {
			return nil, err
		}
	}

	switch req.ExecutionEngine {
	case proto.QueryExecutionEngine_QUERY_EXECUTION_ENGINE_CONNECTION:
	case proto.QueryExecutionEngine_QUERY_EXECUTION_ENGINE_DUCKDB:
		if req.ConnectionId != "" {
			return nil, status.Error(codes.InvalidArgument, "DuckDB query cannot reference a connection")
		}
	default:
		return nil, status.Error(codes.InvalidArgument, "execution_engine is required")
	}

	queryID, created, err := s.createDatasetQueryRecord(ctx, *reportID, req.DatasetId, req.ConnectionId, req.ExecutionEngine, claims.Email)
	if err != nil {
		errtype.LogError(err, "Error creating dataset query")
		if status.Code(err) != codes.Unknown {
			return nil, err
		}
		return nil, status.Error(codes.Internal, err.Error())
	}
	if !created {
		log.Warn().Str("reportID", *reportID).Str("dataset", req.DatasetId).Msg("dataset query was already created")
	}

	s.reportStreams.Ping(*reportID)

	return &proto.CreateQueryResponse{
		DatasetId: req.DatasetId,
		QueryId:   queryID,
	}, nil
}

func (s Server) RunAllQueries(ctx context.Context, req *proto.RunAllQueriesRequest) (*proto.RunAllQueriesResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	report, err := s.getReport(ctx, req.ReportId)
	if err != nil {
		errtype.LogError(err, "Error getting report by ID in RunAllQueries")
		return nil, status.Error(codes.Internal, err.Error())
	}
	if report == nil {
		err := fmt.Errorf("report not found id:%s", req.ReportId)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}
	if err := s.requireReportWorkspaceWrite(ctx, req.ReportId); err != nil {
		return nil, err
	}
	if !report.CanRefresh {
		err := fmt.Errorf("user cannot refresh report")
		log.Err(err).Send()
		return nil, status.Error(codes.PermissionDenied, err.Error())
	}

	queriesRows, err := s.db.QueryContext(ctx,
		`select
			queries.id,
			queries.query_source_id,
			datasets.connection_id,
			queries.query_text,
			datasets.id,
			queries.execution_engine
		from queries
			left join datasets on queries.id = datasets.query_id
			left join reports on (datasets.report_id = reports.id or queries.report_id = reports.id)
		where reports.id = $1`,
		req.ReportId,
	)

	if err != nil {
		errtype.LogError(err, "database operation failed")
		return nil, status.Error(codes.Internal, err.Error())
	}
	defer queriesRows.Close()

	var queries []runQueryOptions
	acceptedJobsByDatasetID := make(map[string]*proto.QueryJob)
	queriesFound := false
	for queriesRows.Next() {
		var queryID string
		var querySourceId string
		var queryText string
		var connectionID sql.NullString
		var datasetID sql.NullString
		var executionEngine proto.QueryExecutionEngine
		err := queriesRows.Scan(
			&queryID,
			&querySourceId,
			&connectionID,
			&queryText,
			&datasetID,
			&executionEngine,
		)
		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}
		queriesFound = true
		if executionEngine == proto.QueryExecutionEngine_QUERY_EXECUTION_ENGINE_DUCKDB {
			if !datasetID.Valid {
				return nil, status.Errorf(codes.FailedPrecondition, "DuckDB query %s is not attached to a dataset", queryID)
			}
			continue
		}
		if executionEngine != proto.QueryExecutionEngine_QUERY_EXECUTION_ENGINE_CONNECTION {
			return nil, status.Errorf(codes.FailedPrecondition, "query %s has no execution engine", queryID)
		}
		connection, err := s.getConnection(ctx, connectionID.String)
		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}
		bucketName := s.getBucketNameFromConnection(connection)

		if queryText == "" && bucketName != "" && querySourceId != "" {
			connCtx := conn.GetCtx(ctx, connection)
			queryText, err = s.getQueryText(connCtx, querySourceId, bucketName)
			if err != nil {
				if isStorageObjectNotFound(err) {
					log.Warn().Err(err).Str("query_id", queryID).Str("query_source_id", querySourceId).Msg("Skipping legacy query with missing source in RunAllQueries")
					continue
				}
				log.Err(err).Msgf("Error getting query text for query %s", queryID)
				return nil, status.Error(codes.Internal, err.Error())
			}
		}

		queryTextParsed, _, err := injectQueryParams(queryText, req.QueryParams, req.GetQueryParamsValues())

		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.InvalidArgument, err.Error())
		}
		if queryTextParsed == "" {
			log.Warn().Str("query_id", queryID).Str("query_source_id", querySourceId).Msg("Skipping empty query in RunAllQueries")
			continue
		}

		queries = append(queries, runQueryOptions{
			reportID:         req.ReportId,
			datasetID:        datasetID.String,
			queryID:          queryID,
			connection:       connection,
			userBucketName:   bucketName,
			queryText:        queryText,
			isPublic:         report.IsPublic,
			queryParams:      req.QueryParams,
			queryParamValues: req.GetQueryParamsValues(),
		})
	}
	if err := queriesRows.Err(); err != nil {
		errtype.LogError(err, "read report queries failed")
		return nil, status.Error(codes.Internal, err.Error())
	}
	if err := queriesRows.Close(); err != nil {
		errtype.LogError(err, "close report queries failed")
		return nil, status.Error(codes.Internal, err.Error())
	}

	if len(queries) == 0 {
		if !queriesFound {
			err := fmt.Errorf("queries not found report_id:%s", req.ReportId)
			log.Warn().Err(err).Send()
			return nil, status.Error(codes.NotFound, err.Error())
		}
	} else {
		type queryResult struct {
			datasetID string
			queryJob  *proto.QueryJob
			err       error
		}
		res := make(chan queryResult, len(queries))

		for i := range queries {
			go func(i int) {
				queryJob, runErr := s.runQuery(ctx, queries[i])
				res <- queryResult{datasetID: queries[i].datasetID, queryJob: queryJob, err: runErr}
			}(i)
		}

		for range queries {
			result := <-res
			if result.err != nil {
				if result.err == context.Canceled {
					log.Warn().Err(result.err).Send()
					return nil, status.Error(codes.Canceled, result.err.Error())
				}
				log.Err(result.err).Send()
				return nil, status.Error(codes.Internal, result.err.Error())
			}
			acceptedJobsByDatasetID[result.datasetID] = result.queryJob
		}
	}

	// Create browser-owned jobs only after every warehouse job was accepted successfully.
	// This prevents a partial Run All failure from leaving invisible pending DuckDB jobs.
	_, queryParamsHash, err := injectQueryParams("", req.QueryParams, req.GetQueryParamsValues())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}
	err = s.ensureSavedDuckDBJobs(ctx, req.ReportId, queryParamsHash, acceptedJobsByDatasetID)
	if err != nil {
		if _, ok := status.FromError(err); ok {
			return nil, err
		}
		errtype.LogError(err, "create DuckDB jobs failed")
		return nil, status.Error(codes.Internal, err.Error())
	}
	// DuckDB jobs enter browser state only through the report stream.
	return &proto.RunAllQueriesResponse{}, nil
}

type runQueryOptions struct {
	reportID         string
	datasetID        string
	queryID          string
	queryText        string
	connection       *proto.Connection
	userBucketName   string
	isPublic         bool // is public report, result should be stored in public storage
	queryParams      []*proto.QueryParam
	queryParamValues string
	updateQuery      bool
	changedBy        string
}

// loadReportQueryParamsTx reads the saved declaration order used for values and job identity.
func loadReportQueryParamsTx(ctx context.Context, tx *sql.Tx, reportID string) ([]*proto.QueryParam, error) {
	var queryParamsJSON []byte
	if err := tx.QueryRowContext(ctx, `select query_params from reports where id=$1`, reportID).Scan(&queryParamsJSON); err != nil {
		return nil, err
	}
	queryParams := make([]*proto.QueryParam, 0)
	// Empty reports have no declarations to decode.
	if len(queryParamsJSON) > 0 {
		if err := json.Unmarshal(queryParamsJSON, &queryParams); err != nil {
			return nil, err
		}
	}
	return queryParams, nil
}

func (s Server) runQuery(ctx context.Context, o runQueryOptions) (*proto.QueryJob, error) {
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	// Warehouse acceptance changes the source revision that a concurrent DuckDB
	// command would pin, so it participates in the same report-first graph lock.
	if err := lockReportTx(ctx, tx, o.reportID); err != nil {
		return nil, err
	}
	var savedQueryText string
	if err := tx.QueryRowContext(ctx, `select query_text from queries where id=$1`, o.queryID).Scan(&savedQueryText); err != nil {
		return nil, err
	}
	queryText := savedQueryText
	if o.updateQuery || queryText == "" {
		queryText = o.queryText
	}
	queryParams := o.queryParams
	// MCP/CLI callers send values only; browser callers may still send declarations.
	if len(queryParams) == 0 {
		queryParams, err = loadReportQueryParamsTx(ctx, tx, o.reportID)
		if err != nil {
			return nil, err
		}
	}
	queryTextParsed, queryParamsHash, err := injectQueryParams(queryText, queryParams, o.queryParamValues)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	connCtx := conn.GetCtx(ctx, o.connection)
	job, jobStatus, err := s.jobs.Create(o.reportID, o.queryID, queryTextParsed, connCtx)
	if err != nil {
		log.Error().Err(err).Msg("Failed to create job")
		return nil, err
	}
	accepted := false
	defer func() {
		if !accepted {
			job.Cancel()
		}
	}()
	var obj storage.StorageObject
	if o.isPublic {
		st := storage.NewPublicStorage()
		extension := "csv"
		if o.connection.ConnectionType == proto.ConnectionType_CONNECTION_TYPE_WHEROBOTS {
			extension = "parquet"
		}
		// Result ID should be same as job ID once available
		obj = st.GetObject(ctx, st.GetDefaultBucketName(), fmt.Sprintf("%s.%s", job.GetID(), extension))
	} else {
		// Result ID should be same as job ID once available
		obj = s.storage.GetObject(connCtx, o.userBucketName, fmt.Sprintf("%s.csv", job.GetID()))
	}
	if o.updateQuery && queryText != savedQueryText {
		h := sha1.New()
		h.Write([]byte(queryText))
		querySourceID := fmt.Sprintf("%x", h.Sum(nil))
		if _, err := tx.ExecContext(ctx,
			`update queries set query_text=$1, query_source_id=$2, query_source=$3,
				duckdb_dependency_dataset_ids='[]', duckdb_validation_error='', updated_at=CURRENT_TIMESTAMP
			where id=$4`,
			queryText,
			querySourceID,
			proto.Query_QUERY_SOURCE_INLINE,
			o.queryID,
		); err != nil {
			return nil, err
		}
		versionID := newUUID()
		if _, err := tx.ExecContext(ctx, `update reports set version_id=$1 where id=$2`, versionID, o.reportID); err != nil {
			return nil, err
		}
		if err := s.createReportSnapshotWithVersionIDTx(
			ctx,
			tx,
			versionID,
			o.reportID,
			o.changedBy,
			proto.ReportSnapshot_TRIGGER_TYPE_QUERY_CHANGE,
		); err != nil {
			return nil, err
		}
	}
	// Persist the saved definition and accepted revision in one per-query critical
	// section. A later Execute can no longer leave an older job as the active row.
	if err := s.insertPendingQueryJob(ctx, tx, job, queryParamsHash, queryTextParsed); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	accepted = true
	s.reportStreams.Ping(o.reportID)
	go s.updateJobStatus(job, jobStatus, queryParamsHash)
	err = job.Run(obj, o.connection)
	if err != nil {
		return nil, err
	}
	return &proto.QueryJob{
		Id:              job.GetID(),
		QueryId:         job.GetQueryID(),
		QueryText:       queryTextParsed,
		JobStatus:       proto.QueryJob_JOB_STATUS_PENDING,
		DwJobId:         stringOrEmpty(job.GetDWJobID()),
		JobResultId:     stringOrEmpty(job.GetResultID()),
		QueryParamsHash: queryParamsHash,
	}, nil
}

func stringOrEmpty(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

// injectQueryParams replaces query parameters with values, returns new query text and values hash
func injectQueryParams(queryText string, params []*proto.QueryParam, valuesUrlEncoded string) (string, string, error) {
	// parse values from URL encoded string
	values := make(map[string]string)
	if valuesUrlEncoded != "" {
		parsedValues, err := url.ParseQuery(valuesUrlEncoded)
		if err != nil {
			log.Error().Err(err).Str("values", valuesUrlEncoded).Msg("Failed to parse query parameters")
			return "", "", err
		}
		for n, v := range parsedValues {
			// all params has prefix qp_ so we need to remove it
			n = strings.TrimPrefix(n, "qp_")
			values[n] = v[0]
		}
	}

	// Hash saved declarations in their report order so caller key order cannot
	// create a second execution identity for the same values.
	canonicalValues := make([]string, 0, len(params))
	for _, param := range params {
		value, exists := values[param.Name]
		// Omitted values hash as defaults, while explicit empty strings retain their identity.
		if !exists {
			value = param.DefaultValue
		}
		canonicalValues = append(canonicalValues, formURLEncode("qp_"+param.Name)+"="+formURLEncode(value))
	}
	h := md5.New()
	h.Write([]byte(strings.Join(canonicalValues, "&")))
	valuesHash := fmt.Sprintf("%x", h.Sum(nil))

	// replace query parameters with values, query parameters should be in format {{param_name}}
	for i := range params {
		value, exists := values[params[i].Name]
		if !exists || value == "" {
			value = params[i].DefaultValue
		}
		// Escape special characters in the value to prevent SQL injection
		value = strings.ReplaceAll(value, "'", "''")
		value = strings.ReplaceAll(value, "\\", "\\\\")
		value = strings.ReplaceAll(value, "\x00", "\\0")
		queryText = strings.ReplaceAll(queryText, fmt.Sprintf("{{%s}}", params[i].Name), "'"+value+"'")
	}

	return queryText, valuesHash, nil
}

// formURLEncode matches the browser URLSearchParams serializer used for job identity.
func formURLEncode(value string) string {
	encoded := url.QueryEscape(value)
	encoded = strings.ReplaceAll(encoded, "%2A", "*")
	encoded = strings.ReplaceAll(encoded, "~", "%7E")
	return encoded
}

// dryRunQuery validates SQL synchronously for supported engines (BigQuery for now).
func (s Server) dryRunQuery(ctx context.Context, connection *proto.Connection, queryText string) (*proto.QueryDryRunResult, error) {
	if connection == nil {
		return nil, status.Error(codes.InvalidArgument, "connection is nil")
	}
	if connection.ConnectionType != proto.ConnectionType_CONNECTION_TYPE_BIGQUERY {
		return &proto.QueryDryRunResult{
			Supported: false,
			Valid:     false,
			Message:   "dry run not supported",
		}, nil
	}
	if connection.BigqueryKey == nil && !conn.IsSystemConnectionID(connection.GetId()) && !user.HasValidatedMCPGoogleAccessToken(ctx) {
		return &proto.QueryDryRunResult{
			Supported: false,
			Valid:     false,
			Message:   "dry run not supported for BigQuery passthrough auth",
		}, nil
	}
	if strings.TrimSpace(queryText) == "" {
		return &proto.QueryDryRunResult{
			Supported: true,
			Valid:     true,
			Message:   "query text is empty",
		}, nil
	}
	client, err := bqutils.GetClient(ctx, connection)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	defer client.Close()
	query := client.Query(queryText)
	query.DryRun = true
	job, err := query.Run(ctx)
	if err != nil {
		return &proto.QueryDryRunResult{
			Supported: true,
			Valid:     false,
			Message:   err.Error(),
		}, nil
	}
	stats, ok := job.LastStatus().Statistics.Details.(*bigquery.QueryStatistics)
	if !ok || stats == nil {
		return &proto.QueryDryRunResult{
			Supported: true,
			Valid:     true,
		}, nil
	}
	return &proto.QueryDryRunResult{
		Supported:               true,
		Valid:                   true,
		EstimatedBytesProcessed: int64(stats.TotalBytesProcessed),
	}, nil
}

// updateQueryTextIfChanged stores query text and returns current DuckDB validation.
func (s Server) updateQueryTextIfChanged(ctx context.Context, queryID string, q *query.QueryDetails, queryText string) (bool, string, error) {
	// Unchanged connection queries have no compiler state to read under the report lock.
	if queryText == q.QueryText && q.ExecutionEngine != proto.QueryExecutionEngine_QUERY_EXECUTION_ENGINE_DUCKDB {
		return false, "", nil
	}
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{})
	if err != nil {
		return false, "", status.Error(codes.Internal, err.Error())
	}
	defer tx.Rollback()
	if err := lockReportTx(ctx, tx, q.ReportID); err != nil {
		return false, "", status.Error(codes.Internal, err.Error())
	}
	var currentText, validationError string
	if err := tx.QueryRowContext(ctx, `select query_text, duckdb_validation_error from queries where id=$1`, queryID).
		Scan(&currentText, &validationError); err != nil {
		return false, "", status.Error(codes.Internal, err.Error())
	}
	updated := currentText != queryText
	// Unchanged DuckDB queries return the stored validation from this locked state.
	if !updated {
		return false, validationError, nil
	}
	err = storeQuerySync(ctx, tx, queryID, queryText, q.PrevQuerySourceId)
	if err != nil {
		// A concurrent query-source write remains a canceled versioned command.
		if _, ok := err.(*queryWasNotUpdated); ok {
			log.Warn().Str("queryId", queryID).Msg("Query was not updated")
			return false, "", status.Error(codes.Canceled, err.Error())
		}
		log.Error().Err(err).Send()
		return false, "", status.Error(codes.Internal, err.Error())
	}
	if q.ExecutionEngine == proto.QueryExecutionEngine_QUERY_EXECUTION_ENGINE_DUCKDB {
		duckDBQueries, catalog, queryParams, err := loadDuckDBGraphTx(ctx, tx, q.ReportID)
		if err != nil {
			return false, "", status.Error(codes.Internal, err.Error())
		}
		if err := analyzeDuckDBQueries(ctx, tx, duckDBQueries, catalog, queryParams); err != nil {
			return false, "", status.Error(codes.Internal, err.Error())
		}
		for _, candidate := range duckDBQueries {
			// The response reports validation for the query being updated.
			if candidate.queryID == queryID {
				validationError = candidate.validationError
				break
			}
		}
	}
	claims := user.GetClaims(ctx)
	if err := s.snapshotDuckDBQueryChangeTx(ctx, tx, q.ReportID, claims.Email); err != nil {
		errtype.LogError(err, "Error creating report snapshot")
		return false, "", status.Error(codes.Internal, err.Error())
	}
	if err := tx.Commit(); err != nil {
		return false, "", status.Error(codes.Internal, err.Error())
	}
	s.reportStreams.Ping(q.ReportID)
	return true, validationError, nil
}

// snapshotDuckDBQueryChangeTx records a query definition change in report history.
func (s Server) snapshotDuckDBQueryChangeTx(ctx context.Context, tx *sql.Tx, reportID, changedBy string) error {
	versionID := newUUID()
	if _, err := tx.ExecContext(ctx, `update reports set version_id=$1 where id=$2`, versionID, reportID); err != nil {
		return err
	}
	return s.createReportSnapshotWithVersionIDTx(ctx, tx, versionID, reportID, changedBy, proto.ReportSnapshot_TRIGGER_TYPE_QUERY_CHANGE)
}

type updateQueryValidator func(context.Context, *proto.UpdateQueryRequest, *query.QueryDetails) (*proto.QueryDryRunResult, error)

// UpdateQuery updates query text and creates snapshot without executing the query.
func (s Server) UpdateQuery(ctx context.Context, req *proto.UpdateQueryRequest) (*proto.UpdateQueryResponse, error) {
	return s.updateQuery(ctx, req, nil)
}

func (s Server) updateQuery(ctx context.Context, req *proto.UpdateQueryRequest, validate updateQueryValidator) (*proto.UpdateQueryResponse, error) {
	q, err := s.getWritableQueryDetails(ctx, req.GetQueryId())
	if err != nil {
		return nil, err
	}
	var dryRun *proto.QueryDryRunResult
	if validate != nil {
		dryRun, err = validate(ctx, req, q)
		if err != nil {
			return nil, err
		}
	}

	updated, _, err := s.updateQueryTextIfChanged(ctx, req.QueryId, q, req.GetQueryText())
	if err != nil {
		return nil, err
	}

	response := &proto.UpdateQueryResponse{
		QueryId: req.QueryId,
		Updated: updated,
	}
	if dryRun != nil {
		response.DryRun = dryRun
	}
	return response, nil
}

// getWritableQueryDetails validates query identity and write access for query commands.
func (s Server) getWritableQueryDetails(ctx context.Context, queryID string) (*query.QueryDetails, error) {
	if user.GetClaims(ctx) == nil {
		return nil, Unauthenticated
	}
	if err := validateUUIDField(queryID, "query_id"); err != nil {
		return nil, err
	}
	q, err := query.GetQueryDetails(ctx, s.db, queryID)
	if err != nil {
		errtype.LogError(err, "database operation failed")
		return nil, status.Error(codes.Internal, err.Error())
	}
	if q.ReportID == "" {
		err := fmt.Errorf("query not found id:%s", queryID)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}
	report, err := s.getReport(ctx, q.ReportID)
	if err != nil {
		errtype.LogError(err, "database operation failed")
		return nil, status.Error(codes.Internal, err.Error())
	}
	if report == nil {
		err := fmt.Errorf("report not found id:%s", q.ReportID)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}
	if err := s.requireReportWorkspaceWrite(ctx, q.ReportID); err != nil {
		return nil, err
	}
	if !report.CanWrite {
		return nil, status.Error(codes.PermissionDenied, "permission denied")
	}
	return q, nil
}

type runQueryConnectionValidator func(context.Context, *proto.Connection) error

// RunQuery job against database
func (s Server) RunQuery(ctx context.Context, req *proto.RunQueryRequest) (*proto.RunQueryResponse, error) {
	return s.runQueryRequest(ctx, req, nil)
}

func (s Server) runQueryRequest(ctx context.Context, req *proto.RunQueryRequest, validate runQueryConnectionValidator) (*proto.RunQueryResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	if err := validateUUIDField(req.GetQueryId(), "query_id"); err != nil {
		return nil, err
	}
	q, err := query.GetQueryDetails(ctx, s.db, req.QueryId)
	if err != nil {
		errtype.LogError(err, "database operation failed")
		return nil, status.Error(codes.Internal, err.Error())
	}

	if q.ReportID == "" {
		err := fmt.Errorf("query not found id:%s", req.QueryId)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}

	report, err := s.getReport(ctx, q.ReportID)

	if err != nil {
		errtype.LogError(err, "database operation failed")
		return nil, status.Error(codes.Internal, err.Error())
	}

	if report == nil {
		err := fmt.Errorf("report not found id:%s", q.ReportID)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}
	if err := s.requireReportWorkspaceWrite(ctx, q.ReportID); err != nil {
		return nil, err
	}

	if !report.CanRefresh {
		err := fmt.Errorf("permission denied")
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.PermissionDenied, err.Error())
	}

	if q.ExecutionEngine == proto.QueryExecutionEngine_QUERY_EXECUTION_ENGINE_DUCKDB {
		return nil, status.Error(codes.InvalidArgument, "DuckDB queries must use RunDuckDBQuery")
	}
	if q.ExecutionEngine != proto.QueryExecutionEngine_QUERY_EXECUTION_ENGINE_CONNECTION {
		return nil, status.Error(codes.FailedPrecondition, "query has no execution engine")
	}
	connection, err := s.getConnection(ctx, q.ConnectionID)

	if err != nil {
		errtype.LogError(err, "database operation failed")
		return nil, status.Error(codes.Internal, err.Error())
	}
	if validate != nil {
		if err := validate(ctx, connection); err != nil {
			return nil, err
		}
	}
	queryID := req.QueryId
	queryText := q.QueryText
	updateQuery := report.CanWrite && req.QueryText != ""
	if updateQuery {
		queryText = req.QueryText
	}
	queryJob, err := s.runQuery(ctx, runQueryOptions{
		reportID:         q.ReportID,
		queryID:          queryID,
		queryText:        queryText,
		connection:       connection,
		userBucketName:   s.getBucketNameFromConnection(connection),
		isPublic:         report.IsPublic,
		queryParams:      req.QueryParams,
		queryParamValues: req.QueryParamsValues,
		updateQuery:      updateQuery,
		changedBy:        claims.Email,
	})

	if err != nil {
		if err == context.Canceled {
			log.Warn().Err(err).Send()
			return nil, status.Error(codes.Canceled, err.Error())
		}
		if status.Code(err) != codes.Unknown {
			return nil, err
		}
		log.Err(err).
			Str("queryID", req.QueryId).
			Str("connectionID", connection.Id).
			Str("connectionType", connection.ConnectionType.String()).
			Str("workspaceID", checkWorkspace(ctx).ID).
			Str("email", claims.Email).
			Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	res := &proto.RunQueryResponse{
		QueryJob:        queryJob,
		ExecutionEngine: proto.QueryExecutionEngine_QUERY_EXECUTION_ENGINE_CONNECTION,
	}
	return res, nil
}

// RunDuckDBQuery accepts an explicit execution and always creates a new immutable job.
func (s Server) RunDuckDBQuery(ctx context.Context, req *proto.RunDuckDBQueryRequest) (*proto.RunDuckDBQueryResponse, error) {
	q, err := s.getWritableQueryDetails(ctx, req.QueryId)
	if err != nil {
		return nil, err
	}
	if q.ExecutionEngine != proto.QueryExecutionEngine_QUERY_EXECUTION_ENGINE_DUCKDB {
		return nil, status.Error(codes.InvalidArgument, "query is not a DuckDB query")
	}
	if strings.TrimSpace(req.QueryText) == "" {
		return nil, status.Error(codes.InvalidArgument, "query_text is required")
	}
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{})
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	defer tx.Rollback()
	if err := lockReportTx(ctx, tx, q.ReportID); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	queryParams, err := loadReportQueryParamsTx(ctx, tx, q.ReportID)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	_, paramsHash, err := injectQueryParams("", queryParams, req.GetQueryParamsValues())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}
	var currentText, currentSourceID string
	if err := tx.QueryRowContext(ctx, `select query_text, query_source_id from queries where id=$1`, req.GetQueryId()).Scan(&currentText, &currentSourceID); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	if currentSourceID != req.GetExpectedQuerySourceId() {
		return nil, status.Error(codes.Aborted, "query changed before execution")
	}
	definitionChanged := currentText != req.GetQueryText()
	if definitionChanged {
		hash := sha1.Sum([]byte(req.GetQueryText()))
		if _, err := tx.ExecContext(ctx, `update queries set query_text=$1, query_source=$2,
			query_source_id=$3, updated_at=CURRENT_TIMESTAMP where id=$4`, req.GetQueryText(), proto.Query_QUERY_SOURCE_INLINE, fmt.Sprintf("%x", hash[:]), req.GetQueryId()); err != nil {
			return nil, status.Error(codes.Internal, err.Error())
		}
	}
	if _, err := s.reconcileDuckDBGraphTx(ctx, tx, q.ReportID, paramsHash, []string{req.GetQueryId()}, req.GetQueryId(), nil); err != nil {
		return nil, err
	}
	if definitionChanged {
		if err := s.snapshotDuckDBQueryChangeTx(ctx, tx, q.ReportID, user.GetClaims(ctx).Email); err != nil {
			return nil, status.Error(codes.Internal, err.Error())
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	s.reportStreams.Ping(q.ReportID)
	return &proto.RunDuckDBQueryResponse{}, nil
}

func validateUUIDField(value, name string) error {
	if strings.TrimSpace(value) == "" {
		return status.Error(codes.InvalidArgument, fmt.Sprintf("%s is required", name))
	}
	if _, err := uuid.Parse(value); err != nil {
		return status.Error(codes.InvalidArgument, fmt.Sprintf("invalid %s format", name))
	}
	return nil
}
