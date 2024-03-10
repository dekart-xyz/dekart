package dekart

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/report"
	"dekart/src/server/user"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (s Server) sendReportMessage(reportID string, srv proto.Dekart_GetReportStreamServer, sequence int64) error {
	ctx := srv.Context()

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

	res := proto.ReportStreamResponse{
		Report:   report,
		Queries:  queries,
		Datasets: datasets,
		Files:    files,
		StreamOptions: &proto.StreamOptions{
			Sequence: sequence,
		},
	}

	err = srv.Send(&res)
	if err != nil {
		log.Err(err).Send()
		return err
	}
	return nil

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

	ctx, cancel := context.WithTimeout(srv.Context(), 55*time.Second)
	defer cancel()

	for {
		select {
		case sequence := <-ping:
			log.Debug().Str("reportID", req.Report.Id).Int64("sequence", sequence).Msg("Sending report message")
			return s.sendReportMessage(req.Report.Id, srv, sequence)
		case <-ctx.Done():
			log.Debug().Str("reportID", req.Report.Id).Msg("GetReportStream ctx done")
			return nil
		}
	}
}

func (s Server) sendReportList(ctx context.Context, srv proto.Dekart_GetReportListStreamServer, sequence int64) error {
	claims := user.GetClaims(ctx)
	reportRows, err := s.db.QueryContext(ctx,
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
			created_at
		from reports
		where author_email=$1 or (discoverable=true and archived=false) or allow_edit=true
		order by updated_at desc`,
		claims.Email,
	)
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

func (s Server) sendUserStreamResponse(ctx context.Context, srv proto.Dekart_GetUserStreamServer, sequence int64) error {
	claims := user.GetClaims(srv.Context())
	connectionUpdate, err := s.getLastConnectionUpdate(ctx)
	if err != nil {
		log.Err(err).Send()
		return status.Errorf(codes.Internal, err.Error())
	}

	// query from db user scopes
	res, err := s.db.QueryContext(ctx,
		`select sensitive_scope from users where email=$1`,
		claims.Email,
	)
	if err != nil {
		log.Err(err).Send()
		return status.Errorf(codes.Internal, err.Error())
	}
	defer res.Close()
	sensitiveScopesGranted := ""
	for res.Next() {
		err = res.Scan(&sensitiveScopesGranted)
		if err != nil {
			log.Err(err).Send()
			return status.Errorf(codes.Internal, err.Error())
		}
	}

	response := proto.GetUserStreamResponse{
		StreamOptions: &proto.StreamOptions{
			Sequence: sequence,
		},
		ConnectionUpdate:           connectionUpdate,
		Email:                      claims.Email,
		SensitiveScopesGranted:     claims.SensitiveScopesGranted,                      // current token scopes
		SensitiveScopesGrantedOnce: user.HasAllSensitiveScopes(sensitiveScopesGranted), // granted before to app
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

	ctx, cancel := context.WithTimeout(srv.Context(), 55*time.Second)
	defer cancel()

	for {
		select {
		case sequence := <-ping:
			return s.sendUserStreamResponse(ctx, srv, sequence)
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

	ctx, cancel := context.WithTimeout(srv.Context(), 55*time.Second)
	defer cancel()

	for {
		select {
		case sequence := <-ping:
			return s.sendReportList(ctx, srv, sequence)
		case <-ctx.Done():
			return nil
		}
	}
}
