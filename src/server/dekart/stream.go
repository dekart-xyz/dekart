package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
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
		log.Err(err).Msg("Cannot retrieve report")
		return status.Errorf(codes.Internal, err.Error())
	}
	if report == nil {
		err := fmt.Errorf("report %s not found", reportID)
		log.Warn().Err(err).Send()
		return status.Errorf(codes.NotFound, err.Error())
	}

	// update report_analytics
	_, err = s.db.ExecContext(ctx,
		`insert into report_analytics (report_id, email)
		values ($1, $2)
		on conflict (report_id, email) do update set updated_at = CURRENT_TIMESTAMP,
		num_views = report_analytics.num_views + 1`,
		reportID,
		claims.Email,
	)
	if err != nil {
		log.Err(err).Send()
		return status.Errorf(codes.Internal, err.Error())
	}

	datasets, err := s.getDatasets(ctx, reportID)
	if err != nil {
		log.Err(err).Msg("Cannot retrieve datasets")
		return status.Errorf(codes.Internal, err.Error())
	}

	queries, err := s.getQueries(ctx, datasets)
	if err != nil {
		log.Err(err).Msg("Cannot retrieve queries")
		return status.Errorf(codes.Internal, err.Error())
	}

	files, err := s.getFiles(ctx, datasets)
	if err != nil {
		log.Err(err).Msg("Cannot retrieve queries")
		return status.Errorf(codes.Internal, err.Error())
	}

	queryJobs, err := s.getDatasetsQueryJobs(ctx, datasets)
	if err != nil {
		log.Err(err).Msg("Cannot retrieve query jobs")
		return status.Errorf(codes.Internal, err.Error())
	}

	directAccessEmails, err := s.getDirectAccessEmails(ctx, reportID)
	if err != nil {
		log.Err(err).Msg("Cannot retrieve direct access emails")
		return status.Errorf(codes.Internal, err.Error())
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

	err = srv.Send(&res)
	if err != nil {
		log.Err(err).Send()
		return err
	}
	return nil

}

const defaultStreamTimeout = 50 * time.Second

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
		return status.Errorf(codes.InvalidArgument, err.Error())
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

func (s Server) sendReportList(ctx context.Context, srv proto.Dekart_GetReportListStreamServer, sequence int64) error {
	claims := user.GetClaims(ctx)

	var err error
	var reportRows *sql.Rows
	if checkWorkspace(ctx).ID == "" {
		reportRows, err = s.db.QueryContext(ctx,
			`select
				id,
				case when title is null then 'Untitled' else title end as title,
				archived,
				(author_email = $1) or allow_edit as can_write,
				author_email = $1 as is_author,
				author_email,
				discoverable,
				allow_edit,
				updated_at,
				created_at,
				is_public,
				is_playground,
				exists (
					select 1
					from (
						select email, access_level, status,
							row_number() over (partition by email order by created_at desc) as rn
						from report_access_log
						where report_id = r.id
					) t
					where rn = 1 and status != 2
				) as has_direct_access
			from reports as r
			where author_email=$1 and is_playground=true
			order by updated_at desc`,
			claims.Email,
		)
	} else {
		reportRows, err = s.db.QueryContext(ctx,
			`select
				r.id,
				case when r.title is null then 'Untitled' else r.title end as title,
				r.archived,
				(r.author_email = $1) or r.allow_edit as can_write,
				r.author_email = $1 as is_author,
				r.author_email,
				r.discoverable,
				r.allow_edit,
				r.updated_at,
				r.created_at,
				r.is_public,
				r.is_playground,
				exists (
					select 1
					from (
						select email, access_level, status,
							row_number() over (partition by email order by created_at desc) as rn
						from report_access_log
						where report_id = r.id
					) t
					where rn = 1 and status != 2
				) as has_direct_access
			from reports as r
			where (r.author_email=$1 or (r.discoverable=true and r.archived=false) or r.allow_edit=true) and r.workspace_id=$2
			order by r.updated_at desc`,
			claims.Email,
			checkWorkspace(ctx).ID,
		)
	}
	if err != nil {
		log.Err(err).Send()
		return status.Errorf(codes.Internal, err.Error())
	}
	defer reportRows.Close()
	res := proto.ReportListResponse{
		Reports: make([]*proto.Report, 0),
		StreamOptions: &proto.StreamOptions{
			Sequence: sequence,
		},
	}
	for reportRows.Next() {
		report := proto.Report{}
		createdAt := time.Time{}
		updatedAt := time.Time{}
		err = reportRows.Scan(
			&report.Id,
			&report.Title,
			&report.Archived,
			&report.CanWrite,
			&report.IsAuthor,
			&report.AuthorEmail,
			&report.Discoverable,
			&report.AllowEdit,
			&updatedAt,
			&createdAt,
			&report.IsPublic,
			&report.IsPlayground,
			&report.HasDirectAccess,
		)
		if err != nil {
			log.Err(err).Send()
			return status.Errorf(codes.Internal, err.Error())
		}
		report.CreatedAt = createdAt.Unix()
		report.UpdatedAt = updatedAt.Unix()
		res.Reports = append(res.Reports, &report)
	}
	err = srv.Send(&res)
	if err != nil {
		log.Err(err).Send()
		return status.Errorf(codes.Internal, err.Error())
	}
	return nil
}

func (s Server) sendUserStreamResponse(incomingCtx context.Context, srv proto.Dekart_GetUserStreamServer, sequence int64) error {
	ctx := incomingCtx
	if !checkWorkspace(ctx).IsPlayground {
		// if playground we don't care about workspace
		// if not playground, we need to check if workspace was not created after stream was requested
		ctx = s.SetWorkspaceContext(incomingCtx, nil)
	}
	claims := user.GetClaims(ctx)

	// connection update
	connectionUpdate, err := s.getLastConnectionUpdate(ctx)
	if err != nil {
		return GRPCError("error getting connection update", err)
	}

	workspaceUpdate, err := s.getWorkspaceUpdate(ctx)
	if err != nil {
		log.Err(err).Send()
		return status.Errorf(codes.Internal, err.Error())
	}

	response := proto.GetUserStreamResponse{
		StreamOptions: &proto.StreamOptions{
			Sequence: sequence,
		},
		ConnectionUpdate:   connectionUpdate,
		Email:              claims.Email,
		WorkspaceUpdate:    workspaceUpdate,
		WorkspaceId:        checkWorkspace(ctx).ID,
		PlanType:           checkWorkspace(ctx).PlanType,
		Role:               checkWorkspace(ctx).UserRole,
		IsPlayground:       checkWorkspace(ctx).IsPlayground,
		IsDefaultWorkspace: checkWorkspace(ctx).IsDefaultWorkspace,
	}

	err = srv.Send(&response)
	if err != nil {
		log.Err(err).Send()
		return status.Errorf(codes.Internal, err.Error())
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
