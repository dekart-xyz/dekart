package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/job"
	"dekart/src/server/user"
	"fmt"
	"strings"
	"time"

	"github.com/lib/pq"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (s Server) updateJobStatus(job job.Job, jobStatus chan int32, paramHash string, queryText string) {
	for {
		select {
		case status := <-jobStatus:
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
						job_error,
						query_text
					)
					values ($1, $2, $3, $4, $5, $6, $7, $8)`,
					job.GetQueryID(),
					job.GetID(),
					status,
					paramHash,
					job.GetDWJobID(),
					job.GetResultID(),
					job.Err(),
					queryText,
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
						result_uri = $8,
						updated_at=CURRENT_TIMESTAMP
					where id = $9`,
					status,
					job.Err(),
					job.GetResultID(),
					job.GetTotalRows(),
					job.GetProcessedBytes(),
					job.GetResultSize(),
					job.GetDWJobID(),
					job.GetResultURI(),
					job.GetID(),
				)
			}
			cancel()
			if err != nil {
				log.Fatal().Err(err).Msg("updateJobStatus failed")
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
			created_at,
			EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))::bigint * 1000 as job_duration
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
		log.Err(err).Msg("getReportIDFromJobID failed")
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
		log.Err(err).Msg("getQueryJob failed")
		return nil, status.Error(codes.Internal, err.Error())
	}
	if job == nil {
		log.Warn().Str("JobId", req.JobId).Msg("Job not found")
		return nil, status.Error(codes.NotFound, "Job not found")
	}
	reportID, err := s.getReportIDFromJobID(ctx, req.JobId)
	if err != nil {
		log.Err(err).Msg("getReportIDFromJobID failed")
		return nil, status.Error(codes.Internal, err.Error())
	}
	if reportID == "" {
		log.Warn().Str("JobId", req.JobId).Msg("No report found for job")
		return nil, status.Error(codes.NotFound, "No report found for job")
	}
	report, err := s.getReport(ctx, reportID)
	if err != nil {
		log.Err(err).Msg("getReport failed")
		return nil, status.Error(codes.Internal, err.Error())
	}
	if report == nil {
		log.Warn().Str("reportID", reportID).Msg("Report not found")
		return nil, status.Error(codes.NotFound, "Report not found")
	}
	if report.AllowEdit || report.CanWrite {
		if ok := s.jobs.Cancel(req.JobId); !ok {
			log.Warn().Msg("Job was not canceled in memory store, trying to cancel in database")
			_, err = s.db.ExecContext(
				ctx,
				`update query_jobs set
					job_status = $1, updated_at=CURRENT_TIMESTAMP
				where id  = $2`,
				int32(proto.QueryJob_JOB_STATUS_UNSPECIFIED),
				req.JobId,
			)
			if err != nil {
				log.Err(err).Msg("update query_jobs failed")
				return nil, status.Error(codes.Internal, err.Error())
			}
			s.reportStreams.Ping(reportID)
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
		quotedQueryIds := make([]string, len(queryIds))
		for i, id := range queryIds {
			quotedQueryIds[i] = "'" + id + "'"
		}
		queryIdsStr := strings.Join(quotedQueryIds, ",")
		var queryRows *sql.Rows
		var err error
		if IsSqlite() {
			queryRows, err = s.db.QueryContext(ctx,
				`SELECT
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
					created_at,
					(STRFTIME('%s', 'now') - STRFTIME('%s', created_at)) * 1000 as job_duration
				FROM query_jobs
				WHERE query_id IN (`+queryIdsStr+`)
				GROUP BY query_params_hash, query_id
				HAVING created_at = MAX(created_at)
				ORDER BY query_params_hash, query_id`,
			)
		} else {
			queryRows, err = s.db.QueryContext(ctx,
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
				created_at,
				EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))::bigint * 1000 as job_duration
			from query_jobs where query_id = ANY($1) order by query_params_hash, query_id, created_at desc`,
				pq.Array(queryIds),
			)
		}
		if err != nil {
			log.Fatal().Err(err).Interface("queryIds", queryIds).Msgf("select from query_jobs failed, ids: %s", queryIdsStr)
		}
		defer queryRows.Close()
		return rowsToQueryJobs(queryRows)

	}
	return make([]*proto.QueryJob, 0), nil
}

func rowsToQueryJobs(rows *sql.Rows) ([]*proto.QueryJob, error) {
	var jobs []*proto.QueryJob
	for rows.Next() {
		job := &proto.QueryJob{}
		var jobResultId sql.NullString
		var dwJobId sql.NullString
		if IsSqlite() {
			var updatedAtStr, createdAtStr string
			err := rows.Scan(
				&job.Id,
				&job.QueryId,
				&job.JobStatus,
				&jobResultId,
				&job.JobError,
				&job.TotalRows,
				&job.BytesProcessed,
				&job.ResultSize,
				&job.QueryParamsHash,
				&dwJobId,
				&updatedAtStr, // SQLite timestamp string in this case
				&createdAtStr,
				&job.JobDuration,
			)
			if err != nil {
				return nil, fmt.Errorf("scan failed in rowsToQueryJobs error=%q", err)
			}
			// Parse SQLite timestamp strings
			updatedAtTime, err := time.Parse("2006-01-02 15:04:05", updatedAtStr)
			if err != nil {
				return nil, fmt.Errorf("failed to parse updated_at timestamp: %v", err)
			}
			createdAtTime, err := time.Parse("2006-01-02 15:04:05", createdAtStr)
			if err != nil {
				return nil, fmt.Errorf("failed to parse created_at timestamp: %v", err)
			}
			job.UpdatedAt = updatedAtTime.Unix()
			job.CreatedAt = createdAtTime.Unix()
		} else {
			var updatedAt, createdAt time.Time
			err := rows.Scan(
				&job.Id,
				&job.QueryId,
				&job.JobStatus,
				&jobResultId,
				&job.JobError,
				&job.TotalRows,
				&job.BytesProcessed,
				&job.ResultSize,
				&job.QueryParamsHash,
				&dwJobId,
				&updatedAt,
				&createdAt,
				&job.JobDuration,
			)
			if err != nil {
				return nil, fmt.Errorf("scan failed in rowsToQueryJobs error=%q", err)
			}
			job.UpdatedAt = updatedAt.Unix()
			job.CreatedAt = createdAt.Unix()
		}
		job.DwJobId = dwJobId.String
		job.JobResultId = jobResultId.String
		jobs = append(jobs, job)
	}
	return jobs, nil
}
