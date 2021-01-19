package dekart

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/report"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (s Server) sendReportMessage(reportID string, srv proto.Dekart_GetReportStreamServer, sequence int64) error {
	ctx := srv.Context()
	reportRows, err := s.db.QueryContext(ctx,
		`select
			id,
			case when map_config is null then '' else map_config end as map_config,
			case when title is null then 'Untitled' else title end as title
		from reports where id=$1 and not archived limit 1`,
		reportID,
	)
	if err != nil {
		log.Err(err).Send()
		return status.Errorf(codes.Internal, err.Error())
	}
	defer reportRows.Close()
	res := proto.ReportStreamResponse{
		Report: &proto.Report{},
		StreamOptions: &proto.StreamOptions{
			Sequence: sequence,
		},
	}
	for reportRows.Next() {
		err = reportRows.Scan(
			&res.Report.Id,
			&res.Report.MapConfig,
			&res.Report.Title,
		)
		if err != nil {
			log.Err(err).Send()
			return status.Errorf(codes.Internal, err.Error())
		}
	}
	if res.Report.Id == "" {
		err := fmt.Errorf("Report %s not found", res.Report.Id)
		log.Warn().Err(err).Send()
		return status.Errorf(codes.NotFound, err.Error())
	}
	queryRows, err := s.db.QueryContext(ctx,
		`select
			id,
			query_text,
			job_status,
			case when job_result_id is null then '' else cast(job_result_id as VARCHAR) end as job_result_id,
			case when job_error is null then '' else job_error end as job_error,
			case
				when job_started is null
				then 0
				else CAST((extract('epoch' from CURRENT_TIMESTAMP)  - extract('epoch' from job_started))*1000 as INTEGER)
			end as job_duration,
			total_rows,
			bytes_processed,
			result_size
		from queries where report_id=$1`,
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
			&query.JobStatus,
			&query.JobResultId,
			&query.JobError,
			&query.JobDuration,
			&query.TotalRows,
			&query.BytesProcessed,
			&query.ResultSize,
		); err != nil {
			log.Err(err).Send()
			return status.Errorf(codes.Internal, err.Error())
		}
		switch query.JobStatus {
		case proto.Query_JOB_STATUS_UNSPECIFIED:
			query.JobDuration = 0
		case proto.Query_JOB_STATUS_DONE:
			if query.JobResultId != "" {
				query.JobDuration = 0
			}
		}
		res.Queries = append(res.Queries, &query)
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
	if req.StreamOptions == nil {
		err := fmt.Errorf("Missing StreamOptions")
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

	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(srv.Context(), 55*time.Second)
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
	reportRows, err := s.db.QueryContext(ctx,
		`select
			id,
			case when title is null then 'Untitled' else title end as title,
			archived
		from reports order by updated_at desc`,
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
		err = reportRows.Scan(
			&report.Id,
			&report.Title,
			&report.Archived,
		)
		res.Reports = append(res.Reports, &report)
	}
	err = srv.Send(&res)
	if err != nil {
		log.Err(err).Send()
		return status.Errorf(codes.Internal, err.Error())
	}
	return nil
}

// GetReportListStream streams list of reports
func (s Server) GetReportListStream(req *proto.ReportListRequest, srv proto.Dekart_GetReportListStreamServer) error {
	if req.StreamOptions == nil {
		err := fmt.Errorf("Missing StreamOptions")
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
