package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/duckdbsql"
	"dekart/src/server/errtype"
	"encoding/json"
	"fmt"
	"slices"
	"sort"
	"strings"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type duckDBGraphQuery struct {
	queryID              string
	datasetID            string
	queryText            string
	compiledSQL          string
	dependencyDatasetIDs []string
	validationError      string
	hasExecutionHistory  bool
}

type duckDBCatalogDataset struct {
	id    string
	label string
}

// lockReportTx serializes DuckDB graph mutations with the existing report row.
func lockReportTx(ctx context.Context, tx *sql.Tx, reportID string) error {
	if IsSqlite() {
		_, err := tx.ExecContext(ctx, `update reports set updated_at=updated_at where id=$1`, reportID)
		return err
	}
	var id string
	return tx.QueryRowContext(ctx, `select id from reports where id=$1 for update`, reportID).Scan(&id)
}

// compileDuckDBParameterReferences targets the deterministic runtime table for this dataset.
func compileDuckDBParameterReferences(sql, datasetID string, parameterCount int) string {
	viewName := "d_" + strings.ReplaceAll(datasetID, "-", "_")
	parameterTable := `dekart_internal."params_` + viewName + `"`
	for index := 0; index < parameterCount; index++ {
		token := fmt.Sprintf(`__DEKART_BOUND_PARAMETER_%d__`, index)
		reference := fmt.Sprintf(`(SELECT "p%d" FROM %s)`, index, parameterTable)
		sql = strings.ReplaceAll(sql, token, reference)
	}
	return sql
}

// loadDuckDBGraphTx reads current definitions and reproduces the dataset labels shown by the editor.
func loadDuckDBGraphTx(ctx context.Context, tx *sql.Tx, reportID string) ([]duckDBGraphQuery, []duckDBCatalogDataset, []*proto.QueryParam, error) {
	rows, err := tx.QueryContext(ctx, `select d.id, d.name, d.query_id, f.name,
		q.query_text, q.execution_engine,
		exists(select 1 from query_jobs history where history.query_id=q.id)
		from datasets d
		left join queries q on q.id=d.query_id
		left join files f on f.id=d.file_id
		where d.report_id=$1 order by d.created_at, d.id`, reportID)
	if err != nil {
		return nil, nil, nil, err
	}
	defer rows.Close()
	type rowValue struct {
		datasetID string
		name      sql.NullString
		queryID   sql.NullString
		fileName  sql.NullString
		queryText sql.NullString
		engine    sql.NullInt32
		history   bool
	}
	values := make([]rowValue, 0)
	queryOrder := make([]string, 0)
	seenQueries := make(map[string]bool)
	for rows.Next() {
		var value rowValue
		if err := rows.Scan(&value.datasetID, &value.name, &value.queryID, &value.fileName, &value.queryText, &value.engine, &value.history); err != nil {
			return nil, nil, nil, err
		}
		values = append(values, value)
		if value.queryID.Valid && !seenQueries[value.queryID.String] {
			queryOrder = append(queryOrder, value.queryID.String)
			seenQueries[value.queryID.String] = true
		}
	}
	if err := rows.Err(); err != nil {
		return nil, nil, nil, err
	}
	queryNumber := make(map[string]int, len(queryOrder))
	for index, queryID := range queryOrder {
		queryNumber[queryID] = index + 1
	}
	catalog := make([]duckDBCatalogDataset, 0, len(values))
	queries := make([]duckDBGraphQuery, 0)
	for _, value := range values {
		label := value.name.String
		if label == "" && value.queryID.Valid {
			label = fmt.Sprintf("Query %d", queryNumber[value.queryID.String])
		}
		if label == "" && value.fileName.Valid {
			label = value.fileName.String
		}
		if label == "" {
			label = "New"
		}
		isDuckDB := value.engine.Valid && proto.QueryExecutionEngine(value.engine.Int32) == proto.QueryExecutionEngine_QUERY_EXECUTION_ENGINE_DUCKDB
		catalog = append(catalog, duckDBCatalogDataset{id: value.datasetID, label: label})
		if isDuckDB {
			queries = append(queries, duckDBGraphQuery{
				queryID:             value.queryID.String,
				datasetID:           value.datasetID,
				queryText:           value.queryText.String,
				hasExecutionHistory: value.history,
			})
		}
	}
	var paramsJSON []byte
	if err := tx.QueryRowContext(ctx, `select query_params from reports where id=$1`, reportID).Scan(&paramsJSON); err != nil {
		return nil, nil, nil, err
	}
	params := make([]*proto.QueryParam, 0)
	if len(paramsJSON) > 0 {
		if err := json.Unmarshal(paramsJSON, &params); err != nil {
			return nil, nil, nil, err
		}
	}
	return queries, catalog, params, nil
}

// analyzeDuckDBQueries compiles current Query SQL and persists its server-derived graph state.
func analyzeDuckDBQueries(ctx context.Context, tx *sql.Tx, queries []duckDBGraphQuery, catalog []duckDBCatalogDataset, params []*proto.QueryParam) error {
	labels := make(map[string][]string)
	for _, dataset := range catalog {
		labels[dataset.label] = append(labels[dataset.label], dataset.id)
	}
	parameterNames := make([]string, 0, len(params))
	for _, param := range params {
		parameterNames = append(parameterNames, param.Name)
	}
	for index := range queries {
		result := duckdbsql.Compile(ctx, queries[index].queryText, labels, parameterNames)
		queries[index].compiledSQL = compileDuckDBParameterReferences(result.SQL, queries[index].datasetID, len(parameterNames))
		queries[index].dependencyDatasetIDs = result.Dependencies
		queries[index].validationError = result.Error
		dependenciesJSON, err := json.Marshal(queries[index].dependencyDatasetIDs)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `update queries set duckdb_dependency_dataset_ids=$1,
			duckdb_validation_error=$2 where id=$3`, string(dependenciesJSON), queries[index].validationError, queries[index].queryID); err != nil {
			return err
		}
	}
	return nil
}

// analyzeDuckDBGraphTx persists analysis from the current report catalog.
func analyzeDuckDBGraphTx(ctx context.Context, tx *sql.Tx, reportID string) error {
	queries, catalog, params, err := loadDuckDBGraphTx(ctx, tx, reportID)
	if err != nil {
		return err
	}
	return analyzeDuckDBQueries(ctx, tx, queries, catalog, params)
}

// duckDBCycleComponents identifies each cycle so only intra-cycle pins are omitted.
func duckDBCycleComponents(queries []duckDBGraphQuery) map[string]string {
	queryIDByDatasetID := make(map[string]string, len(queries))
	edges := make(map[string][]string, len(queries))
	for _, query := range queries {
		queryIDByDatasetID[query.datasetID] = query.queryID
	}
	for _, query := range queries {
		for _, datasetID := range query.dependencyDatasetIDs {
			if queryID := queryIDByDatasetID[datasetID]; queryID != "" {
				edges[query.queryID] = append(edges[query.queryID], queryID)
			}
		}
	}
	index := 0
	indices := make(map[string]int)
	lowlink := make(map[string]int)
	onStack := make(map[string]bool)
	stack := make([]string, 0)
	components := make(map[string]string)
	var visit func(string)
	visit = func(queryID string) {
		index++
		indices[queryID] = index
		lowlink[queryID] = index
		stack = append(stack, queryID)
		onStack[queryID] = true
		for _, dependencyID := range edges[queryID] {
			if indices[dependencyID] == 0 {
				visit(dependencyID)
				lowlink[queryID] = min(lowlink[queryID], lowlink[dependencyID])
			} else if onStack[dependencyID] {
				lowlink[queryID] = min(lowlink[queryID], indices[dependencyID])
			}
		}
		if lowlink[queryID] != indices[queryID] {
			return
		}
		members := make([]string, 0)
		for {
			member := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			onStack[member] = false
			members = append(members, member)
			if member == queryID {
				break
			}
		}
		selfCycle := len(members) == 1 && slices.Contains(edges[members[0]], members[0])
		if len(members) > 1 || selfCycle {
			sort.Strings(members)
			for _, member := range members {
				components[member] = members[0]
			}
		}
	}
	queryIDs := make([]string, 0, len(queries))
	for _, query := range queries {
		queryIDs = append(queryIDs, query.queryID)
	}
	sort.Strings(queryIDs)
	for _, queryID := range queryIDs {
		if indices[queryID] == 0 {
			visit(queryID)
		}
	}
	return components
}

// orderedDuckDBQueries returns a stable dependency-first traversal with cycle edges omitted.
func orderedDuckDBQueries(queries []duckDBGraphQuery, components map[string]string) []duckDBGraphQuery {
	byID := make(map[string]duckDBGraphQuery, len(queries))
	queryIDByDatasetID := make(map[string]string, len(queries))
	for _, query := range queries {
		byID[query.queryID] = query
		queryIDByDatasetID[query.datasetID] = query.queryID
	}
	queryIDs := make([]string, 0, len(queries))
	for queryID := range byID {
		queryIDs = append(queryIDs, queryID)
	}
	sort.Strings(queryIDs)
	visited := make(map[string]bool)
	ordered := make([]duckDBGraphQuery, 0, len(queries))
	var visit func(string)
	visit = func(queryID string) {
		if visited[queryID] {
			return
		}
		visited[queryID] = true
		dependencies := append([]string(nil), byID[queryID].dependencyDatasetIDs...)
		sort.Strings(dependencies)
		for _, datasetID := range dependencies {
			dependencyQueryID := queryIDByDatasetID[datasetID]
			if dependencyQueryID != "" && (components[queryID] == "" || components[queryID] != components[dependencyQueryID]) {
				visit(dependencyQueryID)
			}
		}
		ordered = append(ordered, byID[queryID])
	}
	for _, queryID := range queryIDs {
		visit(queryID)
	}
	return ordered
}

// affectedDuckDBQueryIDs expands roots to all transitive DuckDB consumers.
func affectedDuckDBQueryIDs(queries []duckDBGraphQuery, rootQueryIDs []string) map[string]bool {
	affected := make(map[string]bool)
	datasetByQueryID := make(map[string]string, len(queries))
	for _, query := range queries {
		datasetByQueryID[query.queryID] = query.datasetID
	}
	for _, queryID := range rootQueryIDs {
		affected[queryID] = true
	}
	changed := true
	for changed {
		changed = false
		for _, query := range queries {
			if affected[query.queryID] {
				continue
			}
			for affectedQueryID := range affected {
				if slices.Contains(query.dependencyDatasetIDs, datasetByQueryID[affectedQueryID]) {
					affected[query.queryID] = true
					changed = true
					break
				}
			}
		}
	}
	return affected
}

// resolveDuckDBRevisionsTx pins stable report-local file or QueryJob identities.
func resolveDuckDBRevisionsTx(ctx context.Context, tx *sql.Tx, reportID, paramsHash string, datasetIDs []string, preferred map[string]*proto.QueryJob) ([]*proto.QueryJobDependencyRevision, error) {
	revisions := make([]*proto.QueryJobDependencyRevision, 0, len(datasetIDs))
	for _, datasetID := range datasetIDs {
		var dependencyReportID string
		var queryID, fileID, fileSourceID sql.NullString
		var fileStatus sql.NullInt64
		if err := tx.QueryRowContext(ctx, `select d.report_id, d.query_id, d.file_id, f.file_source_id, f.file_status
			from datasets d left join files f on f.id=d.file_id where d.id=$1`, datasetID).
			Scan(&dependencyReportID, &queryID, &fileID, &fileSourceID, &fileStatus); err != nil {
			if err == sql.ErrNoRows {
				return nil, status.Error(codes.FailedPrecondition, "DuckDB dependency dataset was not found")
			}
			return nil, err
		}
		if dependencyReportID != reportID {
			return nil, status.Error(codes.InvalidArgument, "DuckDB dependency belongs to another report")
		}
		revision := &proto.QueryJobDependencyRevision{DatasetId: datasetID}
		if fileID.Valid {
			if fileSourceID.String == "" || fileStatus.Int64 != int64(proto.File_STATUS_STORED) {
				return nil, status.Error(codes.FailedPrecondition, "DuckDB file dependency is not ready; refresh queries after the upload finishes")
			}
			revision.FileSourceId = fileSourceID.String
			revisions = append(revisions, revision)
			continue
		}
		if !queryID.Valid {
			return nil, status.Error(codes.FailedPrecondition, "DuckDB dependency has no query or file source")
		}
		if job := preferred[datasetID]; job != nil {
			revision.QueryJobId = job.Id
			revisions = append(revisions, revision)
			continue
		}
		if err := tx.QueryRowContext(ctx, `select id from query_jobs where query_id=$1 and query_params_hash=$2
			order by created_at desc limit 1`, queryID.String, paramsHash).Scan(&revision.QueryJobId); err != nil {
			if err == sql.ErrNoRows {
				return nil, status.Error(codes.FailedPrecondition, "DuckDB dependency has no query job for the current parameters")
			}
			return nil, err
		}
		revisions = append(revisions, revision)
	}
	sort.Slice(revisions, func(i, j int) bool { return revisions[i].DatasetId < revisions[j].DatasetId })
	return revisions, nil
}

// latestDuckDBJobTx loads only immutable execution identity fields for comparison.
func latestDuckDBJobTx(ctx context.Context, tx *sql.Tx, queryID, paramsHash string) (*proto.QueryJob, error) {
	job := &proto.QueryJob{}
	var revisionsJSON string
	if err := tx.QueryRowContext(ctx, `select id, query_id, query_text, job_status, job_error, dependency_revisions
		from query_jobs where query_id=$1 and query_params_hash=$2 order by created_at desc limit 1`, queryID, paramsHash).
		Scan(&job.Id, &job.QueryId, &job.QueryText, &job.JobStatus, &job.JobError, &revisionsJSON); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if err := json.Unmarshal([]byte(revisionsJSON), &job.DependencyRevisions); err != nil {
		return nil, err
	}
	return job, nil
}

func insertDuckDBExecutionTx(ctx context.Context, tx *sql.Tx, queryID, paramsHash, compiledSQL, structuralError string, revisions []*proto.QueryJobDependencyRevision) (*proto.QueryJob, error) {
	jobID := newUUID()
	statusValue := proto.QueryJob_JOB_STATUS_DONE
	if structuralError != "" {
		statusValue = proto.QueryJob_JOB_STATUS_UNSPECIFIED
	}
	revisionsJSON, err := json.Marshal(revisions)
	if err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `insert into query_jobs
		(id, query_id, job_status, query_params_hash, query_text, job_error, dependency_revisions)
		values ($1,$2,$3,$4,$5,$6,$7)`, jobID, queryID, statusValue, paramsHash, compiledSQL, structuralError, string(revisionsJSON)); err != nil {
		return nil, err
	}
	return &proto.QueryJob{Id: jobID, QueryId: queryID, QueryText: compiledSQL, JobStatus: statusValue, JobError: structuralError, QueryParamsHash: paramsHash, DependencyRevisions: revisions}, nil
}

// reconcileDuckDBGraphTx analyzes the current Query graph and appends only changed executions.
func (s Server) reconcileDuckDBGraphTx(ctx context.Context, tx *sql.Tx, reportID, paramsHash string, roots []string, forceRoot string, preferred map[string]*proto.QueryJob) ([]*proto.QueryJob, error) {
	queries, catalog, params, err := loadDuckDBGraphTx(ctx, tx, reportID)
	if err != nil {
		return nil, err
	}
	if err := analyzeDuckDBQueries(ctx, tx, queries, catalog, params); err != nil {
		return nil, err
	}
	if len(roots) == 0 {
		roots = make([]string, 0, len(queries))
		for _, query := range queries {
			roots = append(roots, query.queryID)
		}
	}
	affected := affectedDuckDBQueryIDs(queries, roots)
	components := duckDBCycleComponents(queries)
	queryIDByDatasetID := make(map[string]string, len(queries))
	for _, query := range queries {
		queryIDByDatasetID[query.datasetID] = query.queryID
	}
	if preferred == nil {
		preferred = make(map[string]*proto.QueryJob)
	}
	accepted := make([]*proto.QueryJob, 0)
	for _, query := range orderedDuckDBQueries(queries, components) {
		if !affected[query.queryID] {
			continue
		}
		if strings.TrimSpace(query.queryText) == "" && !query.hasExecutionHistory {
			continue
		}
		structuralError := query.validationError
		dependencies := append([]string(nil), query.dependencyDatasetIDs...)
		if component := components[query.queryID]; component != "" {
			filtered := dependencies[:0]
			for _, datasetID := range dependencies {
				if components[queryIDByDatasetID[datasetID]] != component {
					filtered = append(filtered, datasetID)
				}
			}
			dependencies = filtered
			structuralError = "Circular DuckDB dependency."
		}
		if strings.TrimSpace(query.queryText) == "" {
			structuralError = "DuckDB query text is required"
		}
		revisions := make([]*proto.QueryJobDependencyRevision, 0)
		if structuralError == "" {
			revisions, err = resolveDuckDBRevisionsTx(ctx, tx, reportID, paramsHash, dependencies, preferred)
			if err != nil {
				return nil, err
			}
		}
		latest, err := latestDuckDBJobTx(ctx, tx, query.queryID, paramsHash)
		if err != nil {
			return nil, err
		}
		matches := latest != nil && latest.QueryText == query.compiledSQL && latest.JobError == structuralError &&
			slices.EqualFunc(latest.DependencyRevisions, revisions, func(a, b *proto.QueryJobDependencyRevision) bool {
				return a.DatasetId == b.DatasetId && a.QueryJobId == b.QueryJobId && a.FileSourceId == b.FileSourceId
			})
		job := latest
		if query.queryID == forceRoot || !matches {
			job, err = insertDuckDBExecutionTx(ctx, tx, query.queryID, paramsHash, query.compiledSQL, structuralError, revisions)
			if err != nil {
				return nil, err
			}
			accepted = append(accepted, job)
		}
		if job != nil {
			preferred[query.datasetID] = job
		}
	}
	return accepted, nil
}

// reportHasDuckDB avoids graph transactions for ordinary reports.
func (s Server) reportHasDuckDB(ctx context.Context, reportID string) (bool, error) {
	var hasDuckDB bool
	if err := s.db.QueryRowContext(ctx, `select exists(
		select 1 from datasets d inner join queries q on q.id=d.query_id
		where d.report_id=$1 and q.execution_engine=$2
	)`, reportID, proto.QueryExecutionEngine_QUERY_EXECUTION_ENGINE_DUCKDB).Scan(&hasDuckDB); err != nil {
		return false, err
	}
	return hasDuckDB, nil
}

// reconcileDuckDBGraph opens the report-owned transaction used by committed source transitions.
func (s Server) reconcileDuckDBGraph(ctx context.Context, reportID, paramsHash string) error {
	hasDuckDB, err := s.reportHasDuckDB(ctx, reportID)
	if err != nil {
		return err
	}
	if !hasDuckDB {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := lockReportTx(ctx, tx, reportID); err != nil {
		return err
	}
	if _, err := s.reconcileDuckDBGraphTx(ctx, tx, reportID, paramsHash, nil, "", nil); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.reportStreams.Ping(reportID)
	return nil
}

func duckDBQueryHashesTx(ctx context.Context, tx *sql.Tx, reportID string) ([]string, error) {
	rows, err := tx.QueryContext(ctx, `select distinct qj.query_params_hash
		from query_jobs qj
		inner join queries q on q.id=qj.query_id
		inner join datasets d on d.query_id=q.id
		where d.report_id=$1 and q.execution_engine=$2
		order by qj.query_params_hash`, reportID, proto.QueryExecutionEngine_QUERY_EXECUTION_ENGINE_DUCKDB)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	hashes := make([]string, 0)
	for rows.Next() {
		var hash string
		if err := rows.Scan(&hash); err != nil {
			return nil, err
		}
		hashes = append(hashes, hash)
	}
	return hashes, rows.Err()
}

// reconcileExistingDuckDBJobsTx refreshes parameter variants already represented in the report.
func (s Server) reconcileExistingDuckDBJobsTx(ctx context.Context, tx *sql.Tx, reportID string) error {
	hashes, err := duckDBQueryHashesTx(ctx, tx, reportID)
	if err != nil {
		return err
	}
	if len(hashes) == 0 {
		return analyzeDuckDBGraphTx(ctx, tx, reportID)
	}
	for _, hash := range hashes {
		if _, err := s.reconcileDuckDBGraphTx(ctx, tx, reportID, hash, nil, "", nil); err != nil {
			// Automatic reconciliation leaves unavailable sources for a later trigger.
			if status.Code(err) == codes.FailedPrecondition {
				continue
			}
			return err
		}
	}
	return nil
}

// reconcileExistingDuckDBJobs is best-effort for source transitions that are already durable.
func (s Server) reconcileExistingDuckDBJobs(ctx context.Context, reportID, errorMessage string) {
	hasDuckDB, err := s.reportHasDuckDB(ctx, reportID)
	if err != nil {
		errtype.LogError(err, errorMessage)
		return
	}
	if !hasDuckDB {
		return
	}
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{})
	if err != nil {
		errtype.LogError(err, errorMessage)
		return
	}
	defer tx.Rollback()
	if err := lockReportTx(ctx, tx, reportID); err != nil {
		errtype.LogError(err, errorMessage)
		return
	}
	if err := s.reconcileExistingDuckDBJobsTx(ctx, tx, reportID); err != nil {
		errtype.LogError(err, errorMessage)
		return
	}
	if err := tx.Commit(); err != nil {
		errtype.LogError(err, errorMessage)
	}
}
