package dekart

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/user"
	"fmt"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// CreateReport implementation
func (s Server) CreateReport(ctx context.Context, req *proto.CreateReportRequest) (*proto.CreateReportResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	u, err := uuid.NewRandom()
	if err != nil {
		log.Err(err).Send()
		return nil, err
	}
	_, err = s.db.ExecContext(ctx,
		"INSERT INTO reports (id, author_email) VALUES ($1, $2)",
		u.String(),
		claims.Email,
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

// UpdateReport implementation
func (s Server) UpdateReport(ctx context.Context, req *proto.UpdateReportRequest) (*proto.UpdateReportResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	if req.Report == nil {
		return nil, status.Errorf(codes.InvalidArgument, "req.Report == nil")
	}
	result, err := s.db.ExecContext(ctx,
		`update
			reports
		set map_config=$1, title=$2
		where id=$3 and author_email=$4`,
		req.Report.MapConfig,
		req.Report.Title,
		req.Report.Id,
		claims.Email,
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
		// TODO: distinguish between not found and read only
		err := fmt.Errorf("Report not found id:%s", req.Report.Id)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}

	s.reportStreams.Ping(req.Report.Id)

	return &proto.UpdateReportResponse{}, nil
}

// ArchiveReport implementation
func (s Server) ArchiveReport(ctx context.Context, req *proto.ArchiveReportRequest) (*proto.ArchiveReportResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	_, err := uuid.Parse(req.ReportId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, err.Error())
	}
	result, err := s.db.ExecContext(ctx,
		"update reports set archived=$1 where id=$2 and author_email=$3",
		req.Archive,
		req.ReportId,
		claims.Email,
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
		err := fmt.Errorf("Report not found id:%s", req.ReportId)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}
	s.reportStreams.Ping(req.ReportId)

	return &proto.ArchiveReportResponse{}, nil

}
