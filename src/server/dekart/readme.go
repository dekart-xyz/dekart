package dekart

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/errtype"
	"dekart/src/server/user"
	"fmt"
	"strings"
	"time"

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
		return nil, status.Error(codes.InvalidArgument, err.Error())
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

	updatedAt := time.Now()
	newVersionID := newUUID()

	_, err = s.db.ExecContext(ctx,
		`update reports set readme = $1, updated_at = $2, version_id = $3 where id = $4`,
		req.Markdown, updatedAt, newVersionID, req.ReportId)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	err = s.createReportSnapshotWithVersionID(ctx, newVersionID, req.ReportId, claims.Email, proto.ReportSnapshot_TRIGGER_TYPE_REPORT_CHANGE)
	if err != nil {
		errtype.LogError(err, "Cannot create report snapshot for readme update")
		return nil, status.Error(codes.Internal, err.Error())
	}
	if strings.TrimSpace(req.FromDatasetId) != "" {
		_, err = s.db.ExecContext(ctx,
			`delete from datasets where id=$1`,
			req.FromDatasetId,
		)
		if err != nil {
			errtype.LogError(err, "Error deleting dataset")
		}
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
		return nil, status.Error(codes.InvalidArgument, err.Error())
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

	updatedAt := time.Now()
	newVersionID := newUUID()

	_, err = s.db.ExecContext(ctx,
		`update reports set readme = null, updated_at = $1, version_id = $2 where id = $3`,
		updatedAt, newVersionID, req.ReportId)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	err = s.createReportSnapshotWithVersionID(ctx, newVersionID, req.ReportId, claims.Email, proto.ReportSnapshot_TRIGGER_TYPE_REPORT_CHANGE)
	if err != nil {
		errtype.LogError(err, "Cannot create report snapshot for readme removal")
		return nil, status.Error(codes.Internal, err.Error())
	}
	s.reportStreams.Ping(req.ReportId)
	return &proto.RemoveReadmeResponse{}, nil

}
