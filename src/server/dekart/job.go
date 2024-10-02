package dekart

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/job"
	"time"

	"github.com/rs/zerolog/log"
)

func (s Server) updateJobStatus(job job.Job, jobStatus chan int32) {
	for {
		select {
		case status := <-jobStatus:
			log.Debug().Str("query_id", job.GetQueryID()).Int32("status", status).Msg("Job status changed")
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			var err error
			if status == int32(proto.Query_JOB_STATUS_PENDING) {
				_, err = s.db.ExecContext(
					ctx,
					`update queries set
						job_status = $1,
						job_error = $2,
						job_result_id = $3,
						dw_job_id = $4,
						job_started = CURRENT_TIMESTAMP,
						total_rows = 0,
						bytes_processed = 0,
						result_size = 0,
						updated_at = CURRENT_TIMESTAMP
					where id = $5`,
					status,
					job.Err(),
					job.GetResultID(),
					job.GetDWJobID(),
					job.GetQueryID(),
				)
			} else {
				_, err = s.db.ExecContext(
					ctx,
					`update queries set
						job_status = $1,
						job_error = $2,
						job_result_id = $3,
						total_rows = $4,
						bytes_processed = $5,
						result_size = $6,
						dw_job_id = $7,
						updated_at = CURRENT_TIMESTAMP
					where id = $8`,
					status,
					job.Err(),
					job.GetResultID(),
					job.GetTotalRows(),
					job.GetProcessedBytes(),
					job.GetResultSize(),
					job.GetDWJobID(),
					job.GetQueryID(),
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
