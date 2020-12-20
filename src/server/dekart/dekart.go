package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"fmt"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Server struct {
	Db *sql.DB
	proto.UnimplementedDekartServer
}

func (s Server) CreateReport(ctx context.Context, req *proto.CreateReportRequest) (*proto.CreateReportResponse, error) {
	u, err := uuid.NewRandom()
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	_, err = s.Db.ExecContext(ctx,
		"INSERT INTO reports (id) VALUES ($1)",
		u.String(),
	)
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	res := &proto.CreateReportResponse{
		Report: &proto.Report{
			Id: u.String(),
		},
	}
	return res, nil
}

func (s Server) CreateQuery(ctx context.Context, req *proto.CreateQueryRequest) (*proto.CreateQueryResponse, error) {
	if req.Query == nil {
		return nil, status.Errorf(codes.InvalidArgument, "req.Query == nil")
	}
	u, err := uuid.NewRandom()
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	_, err = s.Db.ExecContext(ctx,
		"INSERT INTO queries (id, report_id, query_text) VALUES ($1, $2, $3)",
		u.String(),
		req.Query.ReportId,
		req.Query.QueryText,
	)
	if err != nil {
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	res := &proto.CreateQueryResponse{
		Query: &proto.Query{
			Id:        u.String(),
			ReportId:  req.Query.ReportId,
			QueryText: req.Query.QueryText,
		},
	}

	return res, nil
}

func (s Server) UpdateQuery(ctx context.Context, req *proto.UpdateQueryRequest) (*proto.UpdateQueryResponse, error) {
	if req.Query == nil {
		return nil, status.Errorf(codes.InvalidArgument, "req.Query == nil")
	}
	result, err := s.Db.ExecContext(ctx,
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

	res := &proto.UpdateQueryResponse{
		Query: &proto.Query{
			Id: req.Query.Id,
		},
	}

	return res, nil
}

func (s Server) GetReportStream(req *proto.ReportStreamRequest, srv proto.Dekart_GetReportStreamServer) error {
	if req.Report == nil {
		return status.Errorf(codes.InvalidArgument, "req.Report == nil")
	}
	ctx := srv.Context()
	reportRows, err := s.Db.QueryContext(ctx,
		"select id from reports where id=$1 limit 1",
		req.Report.Id,
	)
	if err != nil {
		log.Err(err).Send()
		return status.Errorf(codes.Internal, err.Error())
	}
	defer reportRows.Close()
	res := proto.ReportStreamResponse{
		Report: &proto.Report{},
	}
	// queries := make([]Query, 0)
	// 	report := Report{
	// 		Queries: &queries,
	// 	}
	for reportRows.Next() {
		err = reportRows.Scan(&res.Report.Id)
		if err != nil {
			log.Err(err).Send()
			return status.Errorf(codes.Internal, err.Error())
		}
	}
	if res.Report.Id == "" {
		err := fmt.Errorf("Report %s not found", res.Report.Id)
		log.Warn().Err(err).Send()
		// responceError(w, r, fmt.Errorf("report not found"), http.StatusNotFound)
		return status.Errorf(codes.NotFound, err.Error())
	}
	queryRows, err := s.Db.QueryContext(ctx,
		`select id, query_text from queries where report_id=$1`,
		res.Report.Id,
	)
	if err != nil {
		log.Err(err).Send()
		return status.Errorf(codes.Internal, err.Error())
	}
	defer queryRows.Close()
	res.Queries = make([]*proto.Query, 0)
	for queryRows.Next() {
		query := proto.Query{
			ReportId: res.Report.Id,
		}
		if err := queryRows.Scan(
			&query.Id,
			&query.QueryText,
		); err != nil {
			log.Err(err).Send()
			return status.Errorf(codes.Internal, err.Error())
		}
		res.Queries = append(res.Queries, &query)
	}
	srv.Send(&res)
	return nil
}
