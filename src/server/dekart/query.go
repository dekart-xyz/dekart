package dekart

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/job"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// CreateQuery in Report
func (s Server) CreateQuery(ctx context.Context, req *proto.CreateQueryRequest) (*proto.CreateQueryResponse, error) {
	if req.Query == nil {
		return nil, status.Errorf(codes.InvalidArgument, "req.Query == nil")
	}
	u, err := uuid.NewRandom()
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	_, err = s.db.ExecContext(ctx,
		"INSERT INTO queries (id, report_id, query_text) VALUES ($1, $2, $3)",
		u.String(),
		req.Query.ReportId,
		req.Query.QueryText,
	)
	if err != nil {
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	s.reportStreams.Ping(req.Query.ReportId)

	res := &proto.CreateQueryResponse{
		Query: &proto.Query{
			Id:        u.String(),
			ReportId:  req.Query.ReportId,
			QueryText: req.Query.QueryText,
		},
	}

	return res, nil
}

// UpdateQuery by id implementation
func (s Server) UpdateQuery(ctx context.Context, req *proto.UpdateQueryRequest) (*proto.UpdateQueryResponse, error) {
	if req.Query == nil {
		return nil, status.Errorf(codes.InvalidArgument, "req.Query == nil")
	}
	result, err := s.db.ExecContext(ctx,
		"update queries set query_text=$1 where id=$2",
		req.Query.QueryText,
		req.Query.Id,
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
		err := fmt.Errorf("Query not found id:%s", req.Query.Id)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}

	queryRows, err := s.db.QueryContext(ctx,
		"select report_id from queries where id=$1 limit 1",
		req.Query.Id,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	defer queryRows.Close()
	var reportID string
	for queryRows.Next() {
		err := queryRows.Scan(&reportID)
		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}
	}
	s.reportStreams.Ping(reportID)

	res := &proto.UpdateQueryResponse{
		Query: &proto.Query{
			Id: req.Query.Id,
		},
	}

	return res, nil
}

func (s Server) updateJobStatus(job *job.Job) {
	for {
		select {
		case status := <-job.Status:
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			var err error
			if status == int32(proto.Query_JOB_STATUS_RUNNING) {
				_, err = s.db.ExecContext(
					ctx,
					`update queries set
						job_status = $1,
						job_error = $3,
						job_result_id = $4,
						job_started = CURRENT_TIMESTAMP
					where id  = $2`,
					status,
					job.QueryID,
					job.Err(),
					job.GetResultID(),
				)

			} else {
				_, err = s.db.ExecContext(
					ctx,
					"update queries set job_status = $1, job_error = $3, job_result_id = $4 where id  = $2",
					status,
					job.QueryID,
					job.Err(),
					job.GetResultID(),
				)
			}
			cancel()
			if err != nil {
				log.Fatal().Err(err).Send()
			}
			s.reportStreams.Ping(job.ReportID)
		case <-job.Ctx.Done():
			return
		}
	}
}

// RunQuery job against database
func (s Server) RunQuery(ctx context.Context, req *proto.RunQueryRequest) (*proto.RunQueryResponse, error) {
	queriesRows, err := s.db.QueryContext(ctx,
		`select
			query_text,
			report_id
		from queries where id=$1 limit 1`,
		req.QueryId,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	defer queriesRows.Close()
	var queryText string
	var reportID string
	for queriesRows.Next() {
		err := queriesRows.Scan(&queryText, &reportID)
		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}
	}
	job := s.jobs.New(reportID, req.QueryId)
	obj := s.bucket.Object(fmt.Sprintf("%s.csv", job.ID))
	go s.updateJobStatus(job)
	err = job.Run(queryText, obj)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	res := &proto.RunQueryResponse{}
	return res, nil
}

// CancelQuery jobs
func (s Server) CancelQuery(ctx context.Context, req *proto.CancelQueryRequest) (*proto.CancelQueryResponse, error) {
	_, err := uuid.Parse(req.QueryId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, err.Error())
	}
	queriesRows, err := s.db.QueryContext(ctx,
		"select query_text, report_id from queries where id=$1 limit 1",
		req.QueryId,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	defer queriesRows.Close()
	var queryText string
	var reportID string
	for queriesRows.Next() {
		err := queriesRows.Scan(&queryText, &reportID)
		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}
	}
	if reportID == "" {
		log.Warn().Str("QueryId", req.QueryId).Msg("Query not found")
		return nil, status.Error(codes.NotFound, err.Error())
	}
	s.jobs.Cancel(req.QueryId)
	return &proto.CancelQueryResponse{}, nil
}
