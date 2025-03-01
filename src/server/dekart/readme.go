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

func (s Server) AddReadme(ctx context.Context, req *proto.AddReadmeRequest) (*proto.AddReadmeResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	_, err := uuid.Parse(req.ReportId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, err.Error())
	}
	report, err := s.getReport(ctx, req.ReportId)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	if report == nil {
		err := fmt.Errorf("report not found id:%s", req.ReportId)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}
	if !report.CanWrite {
		err := fmt.Errorf("user cannot write to report %s", req.ReportId)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.PermissionDenied, "cannot write to report")
	}

	_, err = s.db.ExecContext(ctx,
		`update reports set readme = $1 where id = $2`,
		req.Markdown, req.ReportId)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	s.reportStreams.Ping(req.ReportId)
	return &proto.AddReadmeResponse{}, nil
}

func (s Server) RemoveReadme(ctx context.Context, req *proto.RemoveReadmeRequest) (*proto.RemoveReadmeResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	_, err := uuid.Parse(req.ReportId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, err.Error())
	}
	report, err := s.getReport(ctx, req.ReportId)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	if report == nil {
		err := fmt.Errorf("report not found id:%s", req.ReportId)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.NotFound, err.Error())
	}
	if !report.CanWrite {
		err := fmt.Errorf("user cannot write to report %s", req.ReportId)
		log.Warn().Err(err).Send()
		return nil, status.Error(codes.PermissionDenied, "cannot write to report")
	}

	_, err = s.db.ExecContext(ctx,
		`update reports set readme = null where id = $1`,
		req.ReportId)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	s.reportStreams.Ping(req.ReportId)
	return &proto.RemoveReadmeResponse{}, nil

}
