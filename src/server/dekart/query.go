package dekart

import (
	"context"
	"dekart/src/proto"
	"fmt"
	"os"

	"cloud.google.com/go/bigquery"
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

func (s Server) RunQuery(ctx context.Context, req *proto.RunQueryRequest) (*proto.RunQueryResponse, error) {
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
	bigqueryClient, err := bigquery.NewClient(ctx, os.Getenv("DEKART_BIGQUERY_PROJECT_ID"))
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	defer bigqueryClient.Close()

	q := bigqueryClient.Query(queryText)
	job, err := q.Run(ctx)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	//TODO: continuesly update status
	err = s.setJobStatus(ctx, req.QueryId, reportID, 2)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	go s.waitJob(job, req.QueryId, reportID)
	res := &proto.RunQueryResponse{}
	return res, nil
}
