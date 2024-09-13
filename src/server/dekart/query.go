package dekart

import (
	"context"
	"database/sql"
	"fmt"

	"dekart/src/proto"
	"dekart/src/server/conn"
	"dekart/src/server/storage"
	"dekart/src/server/user"

	"github.com/google/uuid"
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
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	if reportID == nil {
		err := fmt.Errorf("dataset not found or permission not granted")
		log.Warn().Err(err).Str("dataset_id", req.DatasetId).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}

	id := newUUID()

	_, err = s.db.ExecContext(ctx,
		`insert into queries (id, query_text) values ($1, '')`,
		id,
	)
	if err != nil {
		log.Err(err).Send()
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
		`update datasets set query_id=$1, updated_at=now() where id=$2 and query_id is null`,
		id,
		req.DatasetId,
	)
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

	report, err := s.getReport(ctx, req.ReportId)
	if err != nil {
		log.Err(err).Send()
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
		where reports.id = $1 and job_status = $2`,
		req.ReportId,
		int32(proto.Query_JOB_STATUS_DONE),
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
		queries = append(queries, runQueryOptions{
			reportID:       req.ReportId,
			queryID:        queryID,
			connection:     connection,
			userBucketName: bucketName,
			queryText:      queryText,
			isPublic:       report.IsPublic,
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
			if queries[i].queryText == "" {
				// for SNOWFLAKE storage queryText is stored in db
				queryText, err := s.getQueryText(ctx, querySourceIds[i], queries[i].userBucketName)
				if err != nil {
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
	reportID       string
	queryID        string
	queryText      string
	connection     *proto.Connection
	userBucketName string
	isPublic       bool // is public report, result should be stored in public storage
}

func (s Server) runQuery(ctx context.Context, o runQueryOptions) error {
	connCtx := conn.GetCtx(ctx, o.connection)
	job, jobStatus, err := s.jobs.Create(o.reportID, o.queryID, o.queryText, connCtx)
	log.Debug().Str("jobID", job.GetID()).Msg("Job created")
	if err != nil {
		log.Error().Err(err).Send()
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
	go s.updateJobStatus(job, jobStatus)
	job.Status() <- int32(proto.Query_JOB_STATUS_PENDING)
	err = job.Run(obj, o.connection)
	if err != nil {
		return err
	}
	return nil
}

// RunQuery job against database
func (s Server) RunQuery(ctx context.Context, req *proto.RunQueryRequest) (*proto.RunQueryResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	log.Debug().Str("query_id", req.QueryId).Int("QueryTextLen", len(req.QueryText)).Msg("RunQuery")

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
		req.QueryId,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
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
			return nil, status.Error(codes.Internal, err.Error())
		}
	}

	if reportID == "" {
		err := fmt.Errorf("query not found id:%s", req.QueryId)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}

	report, err := s.getReport(ctx, reportID)

	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	if report == nil {
		err := fmt.Errorf("report not found id:%s", reportID)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}

	if !(report.CanWrite || report.Discoverable) {
		err := fmt.Errorf("permission denied")
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.PermissionDenied, err.Error())
	}

	connection, err := s.getConnection(ctx, connectionID.String)

	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	if report.CanWrite {
		// update query text if it was changed by user if user has write permission
		// otherwise use query text from db
		queryText = req.QueryText
		err = s.storeQuerySync(ctx, req.QueryId, req.QueryText, prevQuerySourceId)
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

	err = s.runQuery(ctx, runQueryOptions{
		reportID:       reportID,
		queryID:        req.QueryId,
		queryText:      queryText,
		connection:     connection,
		userBucketName: s.getBucketNameFromConnection(connection),
		isPublic:       report.IsPublic,
	})

	if err != nil {
		if err == context.Canceled {
			log.Warn().Err(err).Send()
			return nil, status.Error(codes.Canceled, err.Error())
		}
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}

	res := &proto.RunQueryResponse{}
	return res, nil
}

// CancelQuery jobs
func (s Server) CancelQuery(ctx context.Context, req *proto.CancelQueryRequest) (*proto.CancelQueryResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	log.Debug().Str("query_id", req.QueryId).Msg("CancelQuery")
	_, err := uuid.Parse(req.QueryId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, err.Error())
	}
	var queriesRows *sql.Rows
	if checkWorkspace(ctx).IsPlayground {
		queriesRows, err = s.db.QueryContext(ctx,
			`select
			reports.id
		from queries
			left join datasets on queries.id = datasets.query_id
			left join reports on (datasets.report_id = reports.id or queries.report_id = reports.id)
		where queries.id = $1 and author_email = $2 and is_playground=true
		limit 1`,
			req.QueryId,
			claims.Email,
		)
	} else {
		queriesRows, err = s.db.QueryContext(ctx,
			`select
			reports.id
		from queries
			left join datasets on queries.id = datasets.query_id
			left join reports on (datasets.report_id = reports.id or queries.report_id = reports.id)
		where queries.id = $1 and (author_email = $2 or reports.allow_edit) and workspace_id=$3
		limit 1`,
			req.QueryId,
			claims.Email,
			checkWorkspace(ctx).ID,
		)
	}
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	defer queriesRows.Close()
	var reportID string
	for queriesRows.Next() {
		err := queriesRows.Scan(&reportID)
		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}
	}
	if reportID == "" {
		err := fmt.Errorf("query not found id:%s", req.QueryId)
		log.Warn().Str("QueryId", req.QueryId).Msg("Query not found")
		return nil, status.Error(codes.NotFound, err.Error())
	}

	if ok := s.jobs.Cancel(req.QueryId); !ok {
		log.Debug().Msg("Query was not canceled in memory store, trying to cancel in database")
		_, err = s.db.ExecContext(
			ctx,
			`update queries set
				job_status = $1, updated_at=now()
			where id  = $2`,
			int32(proto.Query_JOB_STATUS_UNSPECIFIED),
			req.QueryId,
		)
		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}
		s.reportStreams.Ping(reportID)
	} else {
		log.Debug().Msg("Query canceled in memory store")
	}
	return &proto.CancelQueryResponse{}, nil
}
