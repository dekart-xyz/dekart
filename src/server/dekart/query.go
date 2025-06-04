package dekart

import (
	"context"
	"crypto/md5"
	"database/sql"
	"fmt"
	"net/url"
	"strings"

	"dekart/src/proto"
	"dekart/src/server/conn"
	"dekart/src/server/storage"
	"dekart/src/server/user"

	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// CreateQuery in dataset
func (s Server) CreateQuery(ctx context.Context, req *proto.CreateQueryRequest) (*proto.CreateQueryResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}

	reportID, err := s.getReportID(ctx, req.DatasetId, true)

	if err != nil {
		log.Err(err).Msg("Error getting report ID")
		return nil, status.Error(codes.Internal, err.Error())
	}

	if reportID == nil {
		err := fmt.Errorf("dataset not found or permission not granted")
		log.Warn().Err(err).Str("dataset_id", req.DatasetId).Msg("Dataset not found")
		return nil, status.Error(codes.NotFound, err.Error())
	}

	if req.ConnectionId != "" {
		err = s.updateDatasetConnection(ctx, req.DatasetId, req.ConnectionId)
		if err != nil {
			log.Err(err).Msg("Error updating dataset connection")
			return nil, status.Error(codes.Internal, err.Error())
		}
	}

	id := newUUID()

	_, err = s.db.ExecContext(ctx,
		`insert into queries (id, query_text) values ($1, '')`,
		id,
	)
	if err != nil {
		log.Err(err).Msg("Error creating query")
		return nil, status.Error(codes.Internal, err.Error())
	}

	err = s.storeQuerySync(ctx, id, "", "")

	if err != nil {
		if _, ok := err.(*queryWasNotUpdated); !ok {
			log.Err(err).Msg("Error updating query text")
			return &proto.CreateQueryResponse{}, status.Error(codes.Internal, err.Error())
		}
		log.Warn().Msg("Query text not updated")
	}

	result, err := s.db.ExecContext(ctx,
		`update datasets set query_id=$1, updated_at=CURRENT_TIMESTAMP where id=$2 and query_id is null`,
		id,
		req.DatasetId,
	)
	if err != nil {
		log.Err(err).Msg("Error updating dataset")
		return nil, status.Error(codes.Internal, err.Error())
	}

	affectedRows, err := result.RowsAffected()
	if err != nil {
		log.Err(err).Msg("Error getting affected rows count after updating dataset")
		return nil, status.Error(codes.Internal, err.Error())
	}

	if affectedRows == 0 {
		log.Warn().Str("reportID", *reportID).Str("dataset", req.DatasetId).Msg("dataset query was already created")
	}

	s.reportStreams.Ping(*reportID)

	return &proto.CreateQueryResponse{}, nil
}

func (s Server) RunAllQueries(ctx context.Context, req *proto.RunAllQueriesRequest) (*proto.RunAllQueriesResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	if checkWorkspace(ctx).UserRole == proto.UserRole_ROLE_VIEWER {
		return nil, status.Error(codes.PermissionDenied, "Only editors can run queries")
	}
	report, err := s.getReport(ctx, req.ReportId)
	if err != nil {
		log.Err(err).Msg("Error getting report by ID in RunAllQueries")
		return nil, status.Error(codes.Internal, err.Error())
	}
	if !(report.CanWrite || report.Discoverable) {
		err := fmt.Errorf("permission denied")
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.PermissionDenied, err.Error())
	}

	queriesRows, err := s.db.QueryContext(ctx,
		`select
			queries.id,
			queries.query_source_id,
			datasets.connection_id,
			queries.query_text
		from queries
			left join datasets on queries.id = datasets.query_id
			left join reports on (datasets.report_id = reports.id or queries.report_id = reports.id)
		where reports.id = $1`,
		req.ReportId,
	)

	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	defer queriesRows.Close()

	var queries []runQueryOptions
	var querySourceIds []string

	for queriesRows.Next() {
		var queryID string
		var querySourceId string
		var queryText string
		var connectionID sql.NullString
		err := queriesRows.Scan(&queryID, &querySourceId, &connectionID, &queryText)
		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}
		querySourceIds = append(querySourceIds, querySourceId)
		connection, err := s.getConnection(ctx, connectionID.String)
		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}
		bucketName := s.getBucketNameFromConnection(connection)

		queryTextParsed, queryParamsHash, err := injectQueryParams(queryText, req.QueryParams, req.GetQueryParamsValues())

		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.InvalidArgument, err.Error())
		}

		queries = append(queries, runQueryOptions{
			reportID:        req.ReportId,
			queryID:         queryID,
			connection:      connection,
			userBucketName:  bucketName,
			queryText:       queryTextParsed,
			isPublic:        report.IsPublic,
			queryParamsHash: queryParamsHash,
		})
	}

	if len(queries) == 0 {
		err := fmt.Errorf("queries not found report_id:%s", req.ReportId)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}

	res := make(chan error, len(queries))

	for i := range queries {
		go func(i int) {
			if queries[i].queryText == "" && queries[i].userBucketName != "" {
				// legacy queries stored in user storage
				connCtx := conn.GetCtx(ctx, queries[i].connection)
				queryText, err := s.getQueryText(connCtx, querySourceIds[i], queries[i].userBucketName)
				if err != nil {
					log.Err(err).Msgf("Error getting query text for query %s", queries[i].queryID)
					res <- err
					return
				}
				queries[i].queryText = queryText
			}
			err = s.runQuery(ctx, queries[i])
			res <- err
		}(i)
	}

	for range queries {
		err := <-res
		if err != nil {
			if err == context.Canceled {
				log.Warn().Err(err).Send()
				return nil, status.Error(codes.Canceled, err.Error())
			}
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}
	}

	return &proto.RunAllQueriesResponse{}, nil
}

type runQueryOptions struct {
	reportID        string
	queryID         string
	queryText       string
	connection      *proto.Connection
	userBucketName  string
	isPublic        bool // is public report, result should be stored in public storage
	queryParamsHash string
}

func (s Server) runQuery(ctx context.Context, o runQueryOptions) error {
	connCtx := conn.GetCtx(ctx, o.connection)
	job, jobStatus, err := s.jobs.Create(o.reportID, o.queryID, o.queryText, connCtx)
	if err != nil {
		log.Error().Err(err).Msg("Failed to create job")
		return err
	}
	var obj storage.StorageObject
	if o.isPublic {
		st := storage.NewPublicStorage()
		// Result ID should be same as job ID once available
		obj = st.GetObject(ctx, st.GetDefaultBucketName(), fmt.Sprintf("%s.csv", job.GetID()))
	} else {
		// Result ID should be same as job ID once available
		obj = s.storage.GetObject(connCtx, o.userBucketName, fmt.Sprintf("%s.csv", job.GetID()))
	}
	go s.updateJobStatus(job, jobStatus, o.queryParamsHash)
	job.Status() <- int32(proto.QueryJob_JOB_STATUS_PENDING)
	err = job.Run(obj, o.connection)
	if err != nil {
		return err
	}
	return nil
}

type queryDetails struct {
	reportID, prevQuerySourceId, connectionID, queryText string
}

func (s Server) getQueryDetails(ctx context.Context, queryID string) (*queryDetails, error) {
	queriesRows, err := s.db.QueryContext(ctx,
		`select
			reports.id,
			queries.query_source_id,
			datasets.connection_id,
			queries.query_text
		from queries
			left join datasets on queries.id = datasets.query_id
			left join reports on (datasets.report_id = reports.id or queries.report_id = reports.id)
		where queries.id = $1
		limit 1`,
		queryID,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	defer queriesRows.Close()
	var reportID string
	var prevQuerySourceId string
	var connectionID sql.NullString
	var queryText string
	for queriesRows.Next() {
		err := queriesRows.Scan(&reportID, &prevQuerySourceId, &connectionID, &queryText)
		if err != nil {
			log.Err(err).Send()
			return nil, err
		}
	}
	return &queryDetails{
		reportID:          reportID,
		prevQuerySourceId: prevQuerySourceId,
		connectionID:      connectionID.String,
		queryText:         queryText,
	}, nil
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

	// calculate hash of values from URL encoded string
	h := md5.New()
	h.Write([]byte(valuesUrlEncoded))
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

// RunQuery job against database
func (s Server) RunQuery(ctx context.Context, req *proto.RunQueryRequest) (*proto.RunQueryResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}

	q, err := s.getQueryDetails(ctx, req.QueryId)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	if q.reportID == "" {
		err := fmt.Errorf("query not found id:%s", req.QueryId)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}

	report, err := s.getReport(ctx, q.reportID)

	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	if report == nil {
		err := fmt.Errorf("report not found id:%s", q.reportID)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}

	if !(report.CanWrite || report.Discoverable) {
		err := fmt.Errorf("permission denied")
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.PermissionDenied, err.Error())
	}

	connection, err := s.getConnection(ctx, q.connectionID)

	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	if report.CanWrite {
		// update query text if it was changed by user if user has write permission
		// otherwise use query text from db
		q.queryText = req.QueryText
		err = s.storeQuerySync(ctx, req.QueryId, req.QueryText, q.prevQuerySourceId)
		if err != nil {
			code := codes.Internal
			if _, ok := err.(*queryWasNotUpdated); ok {
				code = codes.Canceled
				log.Warn().Err(err).Send()
			} else {
				log.Error().Err(err).Send()
			}
			return nil, status.Error(code, err.Error())
		}
	}

	var queryParamsHash string
	q.queryText, queryParamsHash, err = injectQueryParams(q.queryText, req.QueryParams, req.QueryParamsValues)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	err = s.runQuery(ctx, runQueryOptions{
		reportID:        q.reportID,
		queryID:         req.QueryId,
		queryText:       q.queryText,
		connection:      connection,
		userBucketName:  s.getBucketNameFromConnection(connection),
		isPublic:        report.IsPublic,
		queryParamsHash: queryParamsHash,
	})

	if err != nil {
		if err == context.Canceled {
			log.Warn().Err(err).Send()
			return nil, status.Error(codes.Canceled, err.Error())
		}
		log.Err(err).Str("QueryId", req.QueryId).Str("connectionID", connection.Id).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	res := &proto.RunQueryResponse{}
	return res, nil
}
