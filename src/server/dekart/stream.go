package dekart

import (
	"context"
	"dekart/src/proto"
	device "dekart/src/server/deviceauth"
	"dekart/src/server/errtype"
	"dekart/src/server/report"
	"dekart/src/server/user"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (s Server) sendReportMessage(reportID string, srv proto.Dekart_GetReportStreamServer, sequence int64) error {
	ctx := srv.Context()

	claims := user.GetClaims(ctx)

	if claims == nil {
		return Unauthenticated
	}

	report, err := s.getReport(ctx, reportID)
	if err != nil {
		return GRPCError("Cannot retrieve report", err)
	}
	if report == nil {
		err := fmt.Errorf("report %s not found", reportID)
		log.Warn().Err(err).Send()
		return status.Error(codes.NotFound, err.Error())
	}

	if report.TrackViewers {
		if err := s.trackReportVisit(ctx, reportID, claims.Email); err != nil {
			return GRPCError("Cannot insert report analytics", err)
		}
	}

	datasets, err := s.getDatasets(ctx, reportID)
	if err != nil {
		return GRPCError("Cannot retrieve datasets", err)
	}

	queries, err := s.getQueries(ctx, datasets)
	if err != nil {
		return GRPCError("Cannot retrieve queries", err)
	}

	files, err := s.getFiles(ctx, datasets)
	if err != nil {
		return GRPCError("Cannot retrieve files", err)
	}

	queryJobs, err := s.getDatasetsQueryJobs(ctx, datasets)
	if err != nil {
		return GRPCError("Cannot retrieve query jobs", err)
	}

	// REVIEW: Only people who can edit the report receive the emails of people granted direct access.
	var directAccessEmails []string
	if report.CanWrite {
		directAccessEmails, err = s.getDirectAccessEmails(ctx, reportID)
		if err != nil {
			return GRPCError("Cannot retrieve direct access emails", err)
		}
	}

	res := proto.ReportStreamResponse{
		Report:   report,
		Queries:  queries,
		Datasets: datasets,
		Files:    files,
		StreamOptions: &proto.StreamOptions{
			Sequence: sequence,
		},
		QueryJobs:          queryJobs,
		DirectAccessEmails: directAccessEmails,
	}

	// Validate map config size to prevent gRPC message size errors
	// Since map config is the main contributor to message size, check it directly
	if len(report.MapConfig) > MaxMapConfigSize {
		log.Warn().
			Str("reportId", reportID).
			Int("mapConfigSize", len(report.MapConfig)).
			Int("maxAllowed", MaxMapConfigSize).
			Msg("Report map configuration too large for stream")

		return status.Errorf(codes.ResourceExhausted,
			"Report map configuration is too large (%d bytes). Maximum allowed size is %d bytes. Please simplify your map configuration.",
			len(report.MapConfig), MaxMapConfigSize)
	}

	err = srv.Send(&res)
	if err != nil {
		if errtype.TransportClosingRe.MatchString(err.Error()) {
			log.Warn().Err(err).Msg("Client disconnected during report stream")
			return nil // Client disconnected gracefully
		}
		log.Err(err).Send()
		return err
	}
	return nil

}

// trackReportVisit records the immutable visit event and updates the existing aggregate counter together.
func (s Server) trackReportVisit(ctx context.Context, reportID string, email string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx,
		`insert into report_visit_events (report_id, email)
		values ($1, $2)`,
		reportID,
		email,
	)
	if err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx,
		`insert into report_analytics (report_id, email)
		values ($1, $2)
		on conflict (report_id, email) do update set updated_at = CURRENT_TIMESTAMP,
		num_views = report_analytics.num_views + 1`,
		reportID,
		email,
	)
	if err != nil {
		return err
	}

	return tx.Commit()
}

const defaultStreamTimeout = 30 * time.Second

// parse int constant from os env variable DEKART_STREAM_TIMEOUT
func getStreamTimeout() time.Duration {
	timeout := os.Getenv("DEKART_STREAM_TIMEOUT")
	if timeout == "" {
		return defaultStreamTimeout
	}
	timeoutInt, err := strconv.Atoi(timeout)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to parse DEKART_STREAM_TIMEOUT")
	}
	return time.Duration(timeoutInt) * time.Second
}

// GetReportStream which sends report and queries on every update
func (s Server) GetReportStream(req *proto.ReportStreamRequest, srv proto.Dekart_GetReportStreamServer) error {
	claims := user.GetClaims(srv.Context())
	if claims == nil {
		return Unauthenticated
	}
	if req.StreamOptions == nil {
		err := fmt.Errorf("missing StreamOptions")
		return status.Error(codes.InvalidArgument, err.Error())
	}

	if req.Report == nil {
		return status.Errorf(codes.InvalidArgument, "req.Report == nil")
	}

	_, err := uuid.Parse(req.Report.Id)
	if err != nil {
		return status.Error(codes.InvalidArgument, err.Error())
	}

	streamID, err := uuid.NewRandom()
	if err != nil {
		log.Err(err).Send()
		return status.Error(codes.Internal, err.Error())
	}
	ping := s.reportStreams.Register(req.Report.Id, streamID.String(), req.StreamOptions.Sequence)
	defer s.reportStreams.Deregister(req.Report.Id, streamID.String())

	ctx, cancel := context.WithTimeout(srv.Context(), getStreamTimeout())
	defer cancel()

	for {
		select {
		case sequence := <-ping:
			return s.sendReportMessage(req.Report.Id, srv, sequence)
		case <-ctx.Done():
			return nil
		}
	}
}

func (s Server) sendUserStreamResponse(incomingCtx context.Context, srv proto.Dekart_GetUserStreamServer, sequence int64) error {
	ctx := incomingCtx
	if !checkWorkspace(ctx).IsPlayground {
		// if playground we don't care about workspace
		// if not playground, we need to check if workspace was not created after stream was requested
		ctx = s.refreshWorkspaceContext(incomingCtx)
	}
	claims := user.GetClaims(ctx)

	// connection update
	connectionUpdate, err := s.getLastConnectionUpdate(ctx)
	if err != nil {
		return GRPCError("error getting connection update", err)
	}

	workspaceUpdate, err := s.getWorkspaceUpdate(ctx)
	if err != nil {
		return GRPCError("Cannot get workspace update", err)
	}
	tokenUpdate, err := device.GetTokenUpdate(ctx, s.db, checkWorkspace(ctx).ID, claims.Email)
	if err != nil {
		return GRPCError("Cannot get token update", err)
	}

	userWorkspaces, err := s.getUserWorkspaces(ctx, claims.Email)
	if err != nil {
		return GRPCError("Cannot get user workspaces", err)
	}

	response := proto.GetUserStreamResponse{
		StreamOptions: &proto.StreamOptions{
			Sequence: sequence,
		},
		ConnectionUpdate:   connectionUpdate,
		Email:              claims.Email,
		WorkspaceUpdate:    workspaceUpdate,
		TokenUpdate:        tokenUpdate,
		WorkspaceId:        checkWorkspace(ctx).ID,
		PlanType:           checkWorkspace(ctx).PlanType,
		Role:               checkWorkspace(ctx).UserRole,
		IsPlayground:       checkWorkspace(ctx).IsPlayground,
		IsDefaultWorkspace: checkWorkspace(ctx).IsDefaultWorkspace,
		UserWorkspaces:     userWorkspaces,
	}

	err = srv.Send(&response)
	if err != nil {
		if errtype.TransportClosingRe.MatchString(err.Error()) {
			log.Warn().Err(err).Msg("Client disconnected during user stream")
			return nil // Client disconnected gracefully
		}
		log.Err(err).Send()
		return status.Error(codes.Internal, err.Error())
	}
	return nil
}

func (s Server) GetUserStream(req *proto.GetUserStreamRequest, srv proto.Dekart_GetUserStreamServer) error {
	claims := user.GetClaims(srv.Context())
	if claims == nil {
		return Unauthenticated
	}
	if req.StreamOptions == nil {
		err := fmt.Errorf("missing StreamOptions")
		return status.Error(codes.InvalidArgument, err.Error())
	}

	ping, streamID := s.userStreams.Register(*claims, req.StreamOptions.Sequence)
	defer s.userStreams.Deregister(*claims, streamID)

	ctx, cancel := context.WithTimeout(srv.Context(), getStreamTimeout())
	defer cancel()

	for {
		select {
		case sequence := <-ping:
			return s.sendUserStreamResponse(srv.Context(), srv, sequence)
		case <-ctx.Done():
			return nil
		}
	}
}

// GetReportListStream streams list of reports
func (s Server) GetReportListStream(req *proto.ReportListRequest, srv proto.Dekart_GetReportListStreamServer) error {
	claims := user.GetClaims(srv.Context())
	if claims == nil {
		return Unauthenticated
	}
	if req.StreamOptions == nil {
		err := fmt.Errorf("missing StreamOptions")
		return status.Error(codes.InvalidArgument, err.Error())
	}

	streamID, err := uuid.NewRandom()
	if err != nil {
		log.Err(err).Send()
		return status.Error(codes.Internal, err.Error())
	}

	ping := s.reportStreams.Register(report.All, streamID.String(), req.StreamOptions.Sequence)
	defer s.reportStreams.Deregister(report.All, streamID.String())

	ctx, cancel := context.WithTimeout(srv.Context(), getStreamTimeout())
	defer cancel()

	for {
		select {
		case sequence := <-ping:
			return s.sendReportList(srv.Context(), srv, sequence)
		case <-ctx.Done():
			return nil
		}
	}
}
