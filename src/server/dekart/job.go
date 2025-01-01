package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/job"
	"dekart/src/server/user"
	"strings"
	"time"

	"github.com/lib/pq"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (s Server) updateJobStatus(job job.Job, jobStatus chan int32, paramHash string) {
	for {
		select {
		case status := <-jobStatus:
			log.Debug().Str("query_id", job.GetQueryID()).Int32("status", status).Msg("Job status changed")
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			var err error
			if status == int32(proto.QueryJob_JOB_STATUS_PENDING) {
				//insert into query_jobs
				_, err = s.db.ExecContext(
					ctx,
					`insert into query_jobs (
						query_id,
						id,
						job_status,
						query_params_hash,
						dw_job_id,
						job_result_id,
						job_error
					)
					values ($1, $2, $3, $4, $5, $6, $7)`,
					job.GetQueryID(),
					job.GetID(),
					status,
					paramHash,
					job.GetDWJobID(),
					job.GetResultID(),
					job.Err(),
				)

			} else {
				_, err = s.db.ExecContext(
					ctx,
					`update query_jobs set
						job_status = $1,
						job_error = $2,
						job_result_id = $3,
						total_rows = $4,
						bytes_processed = $5,
						result_size = $6,
						dw_job_id = $7,
						updated_at=now()
					where id = $8`,
					status,
					job.Err(),
					job.GetResultID(),
					job.GetTotalRows(),
					job.GetProcessedBytes(),
					job.GetResultSize(),
					job.GetDWJobID(),
					job.GetID(),
				)
			}
			cancel()
			if err != nil {
				log.Fatal().Err(err).Send()
			}
			s.reportStreams.Ping(job.GetReportID())
		case <-job.GetCtx().Done():
			return
		}
	}
}

func (s Server) getQueryJob(ctx context.Context, jobID string) (*proto.QueryJob, error) {
	rows, err := s.db.QueryContext(ctx,
		`select
			id,
			query_id,
			job_status,
			job_result_id,
			job_error,
			total_rows,
			bytes_processed,
			result_size,
			query_params_hash,
			dw_job_id,
			updated_at,
			created_at
		from query_jobs
		where id = $1
		order by created_at desc
		limit 1`,
		jobID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	jobs, err := rowsToQueryJobs(rows)
	if err != nil {
		return nil, err
	}
	if len(jobs) == 0 {
		return nil, nil
	}
	return jobs[0], nil
}

func (s Server) getReportIDFromJobID(ctx context.Context, jobID string) (string, error) {
	var reportID string
	err := s.db.QueryRowContext(ctx,
		`select
			datasets.report_id
		from query_jobs
		left join queries on query_jobs.query_id = queries.id
		left join datasets on queries.id = datasets.query_id
		where query_jobs.id = $1
		limit 1`,
		jobID,
	).Scan(&reportID)
	if err != nil {
		log.Err(err).Send()
		return "", err
	}
	return reportID, nil
}

func (s Server) CancelJob(ctx context.Context, req *proto.CancelJobRequest) (*proto.CancelJobResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	if checkWorkspace(ctx).UserRole == proto.UserRole_ROLE_VIEWER {
		return nil, status.Error(codes.PermissionDenied, "Only editors can cancel queries")
	}
	job, err := s.getQueryJob(ctx, req.JobId)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	if job == nil {
		log.Warn().Str("JobId", req.JobId).Msg("Job not found")
		return nil, status.Error(codes.NotFound, "Job not found")
	}
	reportID, err := s.getReportIDFromJobID(ctx, req.JobId)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	if reportID == "" {
		log.Warn().Str("JobId", req.JobId).Msg("No report found for job")
		return nil, status.Error(codes.NotFound, "No report found for job")
	}
	report, err := s.getReport(ctx, reportID)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	if report == nil {
		log.Warn().Str("reportID", reportID).Msg("Report not found")
		return nil, status.Error(codes.NotFound, "Report not found")
	}
	if report.AllowEdit || report.CanWrite {
		if ok := s.jobs.Cancel(req.JobId); !ok {
			log.Debug().Msg("Job was not canceled in memory store, trying to cancel in database")
			_, err = s.db.ExecContext(
				ctx,
				`update query_jobs set
					job_status = $1, updated_at=now()
				where id  = $2`,
				int32(proto.QueryJob_JOB_STATUS_UNSPECIFIED),
				req.JobId,
			)
			if err != nil {
				log.Err(err).Send()
				return nil, status.Error(codes.Internal, err.Error())
			}
			s.reportStreams.Ping(reportID)
		} else {
			log.Debug().Msg("Job canceled in memory store")
		}
	}
	return &proto.CancelJobResponse{}, nil
}

func (s Server) getDatasetsQueryJobs(ctx context.Context, datasets []*proto.Dataset) ([]*proto.QueryJob, error) {
	queryIds := make([]string, 0)
	for _, dataset := range datasets {
		if dataset.QueryId != "" {
			queryIds = append(queryIds, dataset.QueryId)
		}
	}
	if len(queryIds) > 0 {
		queryIdsStr := strings.Join(queryIds, ",")
		queryRows, err := s.db.QueryContext(ctx,
			`select distinct on (query_params_hash, query_id)
				id,
				query_id,
				job_status,
				job_result_id,
				job_error,
				total_rows,
				bytes_processed,
				result_size,
				query_params_hash,
				dw_job_id,
				updated_at,
				created_at
			from query_jobs where query_id = ANY($1) order by query_params_hash, query_id, created_at desc`,
			pq.Array(queryIds),
		)
		if err != nil {
			log.Fatal().Err(err).Interface("queryIds", queryIds).Msgf("select from query_jobs failed, ids: %s", queryIdsStr)
		}
		defer queryRows.Close()
		return rowsToQueryJobs(queryRows)

	}
	return make([]*proto.QueryJob, 0), nil
}

func rowsToQueryJobs(queryRows *sql.Rows) ([]*proto.QueryJob, error) {
	queryJobs := make([]*proto.QueryJob, 0)
	for queryRows.Next() {
		queryJob := proto.QueryJob{}
		var dwJobId sql.NullString
		var jobResultId sql.NullString
		var createdAt time.Time
		var updatedAt time.Time
		err := queryRows.Scan(
			&queryJob.Id,
			&queryJob.QueryId,
			&queryJob.JobStatus,
			&jobResultId,
			&queryJob.JobError,
			&queryJob.TotalRows,
			&queryJob.BytesProcessed,
			&queryJob.ResultSize,
			&queryJob.QueryParamsHash,
			&dwJobId,
			&updatedAt,
			&createdAt,
		)
		if err != nil {
			log.Fatal().Err(err).Send()
		}
		queryJob.CreatedAt = createdAt.Unix()
		queryJob.UpdatedAt = updatedAt.Unix()
		queryJob.DwJobId = dwJobId.String
		queryJob.JobResultId = jobResultId.String
		queryJobs = append(queryJobs, &queryJob)
	}
	return queryJobs, nil
}
