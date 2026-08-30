package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/query"
	"dekart/src/server/user"
	"fmt"
	"net/url"
	"slices"
	"sort"
	"strings"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const duckDBExecutionVersion = "1.4.3"

type duckDBPreparationSource struct {
	datasetID  string
	queryID    string
	connection *proto.Connection
	fileSource string
	extension  string
}

type duckDBPreparationSnapshot struct {
	catalogRevisions []duckDBCatalogRevision
	paramsRevision   string
	closure          []string
	params           []*proto.QueryParam
	selected         map[string]bool
	ordered          []duckDBGraphQuery
	sources          []duckDBPreparationSource
}

type duckDBCatalogRevision struct {
	datasetID      string
	datasetUpdated string
	queryID        string
	queryUpdated   string
	querySourceID  string
	fileSourceID   string
}

// updateDuckDBQueryForMCP saves and reports compiler validation under one report lock.
func (s *Server) updateDuckDBQueryForMCP(ctx context.Context, req *proto.UpdateQueryRequest, q *query.QueryDetails) (*proto.UpdateQueryResponse, error) {
	updated, validationError, err := s.updateQueryTextIfChanged(ctx, req.GetQueryId(), q, req.GetQueryText())
	if status.Code(err) == codes.Canceled {
		return nil, status.Error(codes.Aborted, status.Convert(err).Message())
	}
	if err != nil {
		return nil, err
	}
	return &proto.UpdateQueryResponse{
		QueryId: req.GetQueryId(),
		Updated: updated,
		DryRun: &proto.QueryDryRunResult{
			Supported: true,
			Valid:     validationError == "",
			Message:   validationError,
		},
	}, nil
}

// prerequisiteDuckDBQueries returns the root's dependency-first DuckDB closure.
func prerequisiteDuckDBQueries(queries []duckDBGraphQuery, rootQueryID string) ([]duckDBGraphQuery, map[string]bool, []string, error) {
	byQueryID := make(map[string]duckDBGraphQuery, len(queries))
	queryIDByDatasetID := make(map[string]string, len(queries))
	for _, candidate := range queries {
		byQueryID[candidate.queryID] = candidate
		queryIDByDatasetID[candidate.datasetID] = candidate.queryID
	}
	// Preparation is valid only for a root represented in the DuckDB graph.
	if _, ok := byQueryID[rootQueryID]; !ok {
		return nil, nil, nil, status.Error(codes.InvalidArgument, "query is not a DuckDB query")
	}
	selected := make(map[string]bool)
	external := make(map[string]bool)
	ordered := make([]duckDBGraphQuery, 0)
	visiting := make(map[string]bool)
	var visit func(string) error
	visit = func(queryID string) error {
		// A completed visit already occupies its dependency-first position.
		if selected[queryID] {
			return nil
		}
		// Re-entering the active path identifies a cycle before any job is created.
		if visiting[queryID] {
			return status.Error(codes.FailedPrecondition, "Circular DuckDB dependency.")
		}
		visiting[queryID] = true
		candidate := byQueryID[queryID]
		dependencies := append([]string(nil), candidate.dependencyDatasetIDs...)
		sort.Strings(dependencies)
		for _, datasetID := range dependencies {
			// DuckDB dependencies recurse locally; other datasets become downloadable sources.
			if dependencyQueryID := queryIDByDatasetID[datasetID]; dependencyQueryID != "" {
				if err := visit(dependencyQueryID); err != nil {
					return err
				}
			} else {
				external[datasetID] = true
			}
		}
		visiting[queryID] = false
		selected[queryID] = true
		ordered = append(ordered, candidate)
		return nil
	}
	if err := visit(rootQueryID); err != nil {
		return nil, nil, nil, err
	}
	externalIDs := make([]string, 0, len(external))
	for datasetID := range external {
		externalIDs = append(externalIDs, datasetID)
	}
	sort.Strings(externalIDs)
	return ordered, selected, externalIDs, nil
}

// captureDuckDBPreparationTx snapshots the catalog and executable prerequisite closure.
func (s *Server) captureDuckDBPreparationTx(ctx context.Context, tx *sql.Tx, reportID, rootQueryID string) (*duckDBPreparationSnapshot, error) {
	queries, catalog, params, err := loadDuckDBGraphTx(ctx, tx, reportID)
	if err != nil {
		return nil, err
	}
	if err := analyzeDuckDBQueries(ctx, tx, queries, catalog, params); err != nil {
		return nil, err
	}
	ordered, selected, externalIDs, err := prerequisiteDuckDBQueries(queries, rootQueryID)
	if err != nil {
		return nil, err
	}
	for _, candidate := range ordered {
		// Headless preparation never emits programs for empty saved definitions.
		if strings.TrimSpace(candidate.queryText) == "" {
			return nil, status.Error(codes.FailedPrecondition, "DuckDB query text is required")
		}
		// Compiler errors must be corrected before a local program can be trusted.
		if candidate.validationError != "" {
			return nil, status.Error(codes.FailedPrecondition, candidate.validationError)
		}
	}
	sources := make([]duckDBPreparationSource, 0, len(externalIDs))
	for _, datasetID := range externalIDs {
		var queryID, connectionID, fileSourceID, mimeType sql.NullString
		var engine sql.NullInt32
		var fileStatus sql.NullInt64
		if err := tx.QueryRowContext(ctx, `select d.query_id, d.connection_id, q.execution_engine,
			f.file_source_id, f.mime_type, f.file_status
			from datasets d left join queries q on q.id=d.query_id left join files f on f.id=d.file_id
			where d.id=$1 and d.report_id=$2`, datasetID, reportID).
			Scan(&queryID, &connectionID, &engine, &fileSourceID, &mimeType, &fileStatus); err != nil {
			if err == sql.ErrNoRows {
				return nil, status.Error(codes.FailedPrecondition, "DuckDB dependency dataset was not found")
			}
			return nil, err
		}
		source := duckDBPreparationSource{datasetID: datasetID}
		// Stored uploads are immutable inputs; all other dependencies must be runnable queries.
		if fileSourceID.Valid {
			// An upload is executable only after permanent storage accepts it.
			if fileStatus.Int64 != int64(proto.File_STATUS_STORED) {
				return nil, status.Error(codes.FailedPrecondition, "DuckDB file dependency is not ready; refresh queries after the upload finishes")
			}
			source.fileSource = fileSourceID.String
			source.extension = getFileExtensionFromMime(mimeType.String)
			// Unknown MIME types cannot be lowered to a fixed DuckDB reader.
			if source.extension == "" {
				return nil, status.Error(codes.FailedPrecondition, "DuckDB file dependency has an unsupported format")
			}
		} else {
			// Warehouse leaves require a connection-backed query with an immutable job result.
			if !queryID.Valid || !connectionID.Valid || !engine.Valid || proto.QueryExecutionEngine(engine.Int32) != proto.QueryExecutionEngine_QUERY_EXECUTION_ENGINE_CONNECTION {
				return nil, status.Error(codes.FailedPrecondition, "DuckDB dependency has no runnable query or file source")
			}
			connection, err := s.getConnection(ctx, connectionID.String)
			if err != nil {
				return nil, err
			}
			if connection == nil {
				return nil, status.Error(codes.FailedPrecondition, "DuckDB dependency connection was not found")
			}
			source.queryID = queryID.String
			source.connection = connection
			source.extension = resultExtensionByConnectionType(connection.ConnectionType)
		}
		sources = append(sources, source)
	}

	revisions := make([]duckDBCatalogRevision, 0, len(catalog))
	rows, err := tx.QueryContext(ctx, `select d.id, cast(d.updated_at as text), coalesce(cast(d.query_id as text), ''),
		coalesce(cast(q.updated_at as text), ''), coalesce(q.query_source_id, ''), coalesce(cast(f.file_source_id as text), '')
		from datasets d left join queries q on q.id=d.query_id left join files f on f.id=d.file_id
		where d.report_id=$1 order by d.created_at, d.id`, reportID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var revision duckDBCatalogRevision
		if err := rows.Scan(&revision.datasetID, &revision.datasetUpdated, &revision.queryID, &revision.queryUpdated, &revision.querySourceID, &revision.fileSourceID); err != nil {
			return nil, err
		}
		revisions = append(revisions, revision)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	var paramsJSON []byte
	if err := tx.QueryRowContext(ctx, `select query_params from reports where id=$1`, reportID).Scan(&paramsJSON); err != nil {
		return nil, err
	}
	closure := make([]string, 0, len(ordered)+len(externalIDs))
	for _, candidate := range ordered {
		closure = append(closure, candidate.datasetID)
	}
	closure = append(closure, externalIDs...)
	return &duckDBPreparationSnapshot{
		catalogRevisions: revisions,
		paramsRevision:   string(paramsJSON),
		closure:          closure,
		params:           params,
		selected:         selected,
		ordered:          ordered,
		sources:          sources,
	}, nil
}

// PrepareDuckDBExecution builds a pinned local-execution program without materializing it.
func (s Server) PrepareDuckDBExecution(ctx context.Context, req *proto.PrepareDuckDBExecutionRequest) (*proto.PrepareDuckDBExecutionResponse, error) {
	return s.prepareDuckDBExecution(ctx, req, nil)
}

func (s *Server) prepareDuckDBExecution(ctx context.Context, req *proto.PrepareDuckDBExecutionRequest, validate runQueryConnectionValidator) (*proto.PrepareDuckDBExecutionResponse, error) {
	if user.GetClaims(ctx) == nil {
		return nil, Unauthenticated
	}
	if err := validateUUIDField(req.GetQueryId(), "query_id"); err != nil {
		return nil, err
	}
	q, err := query.GetQueryDetails(ctx, s.db, req.GetQueryId())
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	if q.ReportID == "" {
		return nil, status.Error(codes.NotFound, "query not found")
	}
	if err := s.requireReportWorkspaceWrite(ctx, q.ReportID); err != nil {
		return nil, err
	}
	report, err := s.getReport(ctx, q.ReportID)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	if report == nil {
		return nil, status.Error(codes.NotFound, "report not found")
	}
	if !report.CanRefresh {
		return nil, status.Error(codes.PermissionDenied, "permission denied")
	}
	if q.ExecutionEngine != proto.QueryExecutionEngine_QUERY_EXECUTION_ENGINE_DUCKDB {
		return nil, status.Error(codes.InvalidArgument, "query is not a DuckDB query")
	}

	firstTx, err := s.db.BeginTx(ctx, &sql.TxOptions{})
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	defer firstTx.Rollback()
	if err := lockReportTx(ctx, firstTx, q.ReportID); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	first, err := s.captureDuckDBPreparationTx(ctx, firstTx, q.ReportID, req.GetQueryId())
	if err != nil {
		return nil, err
	}
	if err := firstTx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	_, paramsHash, err := injectQueryParams("", first.params, req.GetQueryParamsValues())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	preferred := make(map[string]*proto.QueryJob)
	for _, source := range first.sources {
		// Uploaded files need no warehouse refresh.
		if source.queryID == "" {
			continue
		}
		// MCP preparation applies connector credential policy before each leaf launch.
		if validate != nil {
			if err := validate(ctx, source.connection); err != nil {
				return nil, err
			}
		}
		job, err := s.runQuery(ctx, runQueryOptions{
			reportID:         q.ReportID,
			datasetID:        source.datasetID,
			queryID:          source.queryID,
			connection:       source.connection,
			userBucketName:   s.getBucketNameFromConnection(source.connection),
			isPublic:         report.IsPublic,
			queryParams:      first.params,
			queryParamValues: req.GetQueryParamsValues(),
		})
		if err != nil {
			return nil, err
		}
		job.DatasetId = source.datasetID
		preferred[source.datasetID] = job
	}

	secondTx, err := s.db.BeginTx(ctx, &sql.TxOptions{})
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	defer secondTx.Rollback()
	if err := lockReportTx(ctx, secondTx, q.ReportID); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	second, err := s.captureDuckDBPreparationTx(ctx, secondTx, q.ReportID, req.GetQueryId())
	if err != nil {
		return nil, err
	}
	// Never bind accepted leaves to a catalog that changed while locks were released.
	if first.paramsRevision != second.paramsRevision ||
		!slices.Equal(first.catalogRevisions, second.catalogRevisions) ||
		!slices.Equal(first.closure, second.closure) {
		return nil, status.Error(codes.Aborted, "report changed during DuckDB preparation")
	}
	_, jobsByDatasetID, err := reconcileSelectedDuckDBQueriesTx(ctx, secondTx, q.ReportID, paramsHash, second.ordered, second.selected, req.GetQueryId(), preferred)
	if err != nil {
		return nil, err
	}
	rootDatasetID := ""
	for _, candidate := range second.ordered {
		// The requested query determines the only root returned to the caller.
		if candidate.queryID == req.GetQueryId() {
			rootDatasetID = candidate.datasetID
			break
		}
	}
	rootJob := jobsByDatasetID[rootDatasetID]
	// Force-root reconciliation must always yield the newly requested root identity.
	if rootJob == nil || rootJob.QueryId != req.GetQueryId() {
		return nil, status.Error(codes.Internal, "DuckDB root job was not created")
	}
	rootJob.DatasetId = rootDatasetID
	execution, err := lowerDuckDBExecution(second, jobsByDatasetID, req.GetQueryParamsValues())
	if err != nil {
		return nil, err
	}
	if err := secondTx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	s.reportStreams.Ping(q.ReportID)
	return &proto.PrepareDuckDBExecutionResponse{
		QueryJob:        rootJob,
		DuckdbExecution: execution,
	}, nil
}

// lowerDuckDBExecution emits the browser-equivalent graph program in dependency order.
// Input: compiled DuckDB dependency graph, pinned source jobs, parameters, dataset IDs.
// Output: ordered DuckDB SQL statements and source descriptors that the CLI can execute without understanding the graph.
func lowerDuckDBExecution(snapshot *duckDBPreparationSnapshot, jobsByDatasetID map[string]*proto.QueryJob, encodedValues string) (*proto.DuckDBExecution, error) {
	statements := []*proto.DuckDBExecutionStatement{
		{Sql: "CREATE SCHEMA IF NOT EXISTS datasets"},
		{Sql: "CREATE SCHEMA IF NOT EXISTS dekart_internal"},
	}
	sources := make([]*proto.DuckDBExecutionSource, 0, len(snapshot.sources))
	for index, source := range snapshot.sources {
		input := &proto.DuckDBExecutionSource{DatasetId: source.datasetID, Extension: source.extension}
		// Each executable source exposes exactly one immutable revision kind.
		if source.fileSource != "" {
			input.Revision = &proto.DuckDBExecutionSource_FileSourceId{FileSourceId: source.fileSource}
		} else {
			job := jobsByDatasetID[source.datasetID]
			// A warehouse reader must reference the exact job accepted during preparation.
			if job == nil {
				return nil, status.Error(codes.Internal, "DuckDB source job is missing")
			}
			input.Revision = &proto.DuckDBExecutionSource_QueryJobId{QueryJobId: job.Id}
		}
		sources = append(sources, input)
		path := fmt.Sprintf("getvariable('dekart_source_%d_path')", index)
		reader := fmt.Sprintf("read_csv_auto(%s, header=true)", path)
		// Reader selection mirrors the browser's four supported source formats.
		if source.extension == "parquet" {
			reader = fmt.Sprintf("read_parquet(%s)", path)
		} else if source.extension == "json" || source.extension == "geojson" {
			reader = fmt.Sprintf("(SELECT * EXCLUDE (wkb_geometry), wkb_geometry AS _geojson FROM ST_Read(%s, keep_wkb=true))", path)
		}
		statements = append(statements, &proto.DuckDBExecutionStatement{
			Sql: fmt.Sprintf("CREATE OR REPLACE VIEW datasets.%s AS SELECT * FROM %s", quoteDuckDBIdentifier(duckDBDatasetViewName(source.datasetID)), reader),
		})
	}
	parameterValues, err := duckDBParameterValues(snapshot.params, encodedValues)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}
	for _, candidate := range snapshot.ordered {
		job := jobsByDatasetID[candidate.datasetID]
		// Local statements are emitted only for synchronous, error-free DuckDB metadata jobs.
		if job == nil || job.JobStatus != proto.QueryJob_JOB_STATUS_DONE || job.JobError != "" {
			return nil, status.Error(codes.Internal, "DuckDB execution job is invalid")
		}
		viewName := duckDBDatasetViewName(candidate.datasetID)
		paramsTable := `dekart_internal.` + quoteDuckDBIdentifier("params_"+viewName)
		// Parameter tables use the compiler's alphabetical VARCHAR slot order.
		if len(parameterValues) > 0 {
			columns := make([]string, len(parameterValues))
			for index := range parameterValues {
				columns[index] = fmt.Sprintf("CAST(? AS VARCHAR) AS %s", quoteDuckDBIdentifier(fmt.Sprintf("p%d", index)))
			}
			statements = append(statements, &proto.DuckDBExecutionStatement{
				Sql:        fmt.Sprintf("CREATE OR REPLACE TABLE %s AS SELECT %s", paramsTable, strings.Join(columns, ", ")),
				Parameters: parameterValues,
			})
		}
		jobTable := `dekart_internal.` + quoteDuckDBIdentifier(duckDBJobTableName(job.Id))
		statements = append(statements, &proto.DuckDBExecutionStatement{Sql: fmt.Sprintf("CREATE OR REPLACE TABLE %s AS %s", jobTable, job.QueryText)})
		// Parameter tables are node-local and must not leak into the next materialization.
		if len(parameterValues) > 0 {
			statements = append(statements, &proto.DuckDBExecutionStatement{Sql: "DROP TABLE IF EXISTS " + paramsTable})
		}
		statements = append(statements, &proto.DuckDBExecutionStatement{Sql: fmt.Sprintf("CREATE OR REPLACE VIEW datasets.%s AS SELECT * FROM %s", quoteDuckDBIdentifier(viewName), jobTable)})
	}
	return &proto.DuckDBExecution{DuckdbVersion: duckDBExecutionVersion, Sources: sources, Statements: statements}, nil
}

func duckDBDatasetViewName(datasetID string) string {
	return "d_" + strings.ReplaceAll(datasetID, "-", "_")
}

func duckDBJobTableName(jobID string) string {
	return "job_" + strings.ReplaceAll(jobID, "-", "_")
}

func quoteDuckDBIdentifier(value string) string {
	return `"` + strings.ReplaceAll(value, `"`, `""`) + `"`
}

func duckDBParameterValues(params []*proto.QueryParam, encodedValues string) ([]string, error) {
	values, err := url.ParseQuery(encodedValues)
	if err != nil {
		return nil, err
	}
	ordered := append([]*proto.QueryParam(nil), params...)
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].Name < ordered[j].Name })
	result := make([]string, 0, len(ordered))
	for _, param := range ordered {
		value := values.Get("qp_" + param.Name)
		// Empty and omitted execution values both bind the saved default.
		if value == "" {
			value = param.DefaultValue
		}
		result = append(result, value)
	}
	return result, nil
}
