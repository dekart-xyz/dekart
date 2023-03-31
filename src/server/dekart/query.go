package dekart

import (
	"context"
	"crypto/sha1"
	"fmt"
	"time"

	"dekart/src/proto"
	"dekart/src/server/job"
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

	reportID, err := s.getReportID(ctx, req.DatasetId, claims.Email)

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

	result, err := s.db.ExecContext(ctx,
		`update datasets set query_id=$1 where id=$2 and query_id is null`,
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
	go s.storeQuery(*reportID, id, "", "")
	s.reportStreams.Ping(*reportID)

	return &proto.CreateQueryResponse{}, nil
}

// queryWasNotUpdated was not updated because it was changed
type queryWasNotUpdated struct{}

func (e *queryWasNotUpdated) Error() string {
	return "query was not updated"
}

func (s Server) storeQuerySync(ctx context.Context, queryID string, queryText string, prevQuerySourceId string) error {
	h := sha1.New()
	queryTextByte := []byte(queryText)
	h.Write(queryTextByte)
	newQuerySourceId := fmt.Sprintf("%x", h.Sum(nil))
	storageWriter := s.storage.GetObject(fmt.Sprintf("%s.sql", newQuerySourceId)).GetWriter(ctx)
	_, err := storageWriter.Write(queryTextByte)
	if err != nil {
		log.Err(err).Msg("Error writing query_text to storage")
		storageWriter.Close()
		return err
	}
	err = storageWriter.Close()
	if err != nil {
		log.Err(err).Msg("Error writing query_text to storage")
		return err
	}

	result, err := s.db.ExecContext(ctx,
		`update queries set query_source_id=$1, query_source=$2 where id=$3 and query_source_id=$4`,
		newQuerySourceId,
		proto.Query_QUERY_SOURCE_STORAGE,
		queryID,
		prevQuerySourceId,
	)
	if err != nil {
		return err
	}
	affectedRows, _ := result.RowsAffected()
	if affectedRows == 0 {
		return &queryWasNotUpdated{}
	}
	return nil
}

func (s Server) storeQuery(reportID string, queryID string, queryText string, prevQuerySourceId string) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
	defer cancel()
	err := s.storeQuerySync(ctx, queryID, queryText, prevQuerySourceId)
	if _, ok := err.(*queryWasNotUpdated); ok {
		log.Warn().Msg("Query text not updated")
		return
	} else if err != nil {
		log.Err(err).Msg("Error updating query text")
		return
	}
	log.Debug().Msg("Query text updated in storage")
	s.reportStreams.Ping(reportID)
}

func (s Server) updateJobStatus(job job.Job, jobStatus chan int32) {
	for {
		select {
		case status := <-jobStatus:
			log.Debug().Str("query_id", job.GetQueryID()).Int32("status", status).Msg("Job status changed")
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			var err error
			if status == int32(proto.Query_JOB_STATUS_PENDING) {
				_, err = s.db.ExecContext(
					ctx,
					`update queries set
						job_status = $1,
						job_error = $3,
						job_result_id = $4,
						job_started = CURRENT_TIMESTAMP,
						total_rows = 0,
						bytes_processed = 0,
						result_size = 0
					where id  = $2`,
					status,
					job.GetQueryID(),
					job.Err(),
					job.GetResultID(),
				)

			} else {
				_, err = s.db.ExecContext(
					ctx,
					`update queries set
						job_status = $1,
						job_error = $3,
						job_result_id = $4,
						total_rows = $5,
						bytes_processed = $6,
						result_size = $7
					where id  = $2`,
					status,
					job.GetQueryID(),
					job.Err(),
					job.GetResultID(),
					job.GetTotalRows(),
					job.GetProcessedBytes(),
					job.GetResultSize(),
				)
			}
			cancel()
			if err != nil {
				log.Fatal().Err(err).Send()
			}
			s.reportStreams.Ping(job.GetReportID())
		case <-job.GetCtx().Done():
			return
		}
	}
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
			queries.query_source_id
		from queries
			left join datasets on queries.id = datasets.query_id
			left join reports on (datasets.report_id = reports.id or queries.report_id = reports.id)
		where queries.id = $1 and author_email = $2
		limit 1`,
		req.QueryId,
		claims.Email,
	)

	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	defer queriesRows.Close()
	var reportID string
	var prevQuerySourceId string
	for queriesRows.Next() {
		err := queriesRows.Scan(&reportID, &prevQuerySourceId)
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
	job, jobStatus, err := s.jobs.Create(reportID, req.QueryId, req.QueryText)
	log.Debug().Str("jobID", job.GetID()).Msg("Job created")
	if err != nil {
		log.Error().Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	obj := s.storage.GetObject(fmt.Sprintf("%s.csv", job.GetID()))
	go s.updateJobStatus(job, jobStatus)
	job.Status() <- int32(proto.Query_JOB_STATUS_PENDING)
	err = job.Run(obj)
	if err != nil {
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
	queriesRows, err := s.db.QueryContext(ctx,
		`select 
			reports.id
		from queries
			left join datasets on queries.id = datasets.query_id
			left join reports on (datasets.report_id = reports.id or queries.report_id = reports.id)
		where queries.id = $1 and author_email = $2
		limit 1`,
		req.QueryId,
		claims.Email,
	)
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
				job_status = $1
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
