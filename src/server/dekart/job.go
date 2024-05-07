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
						job_error = $3,
						job_result_id = $4,
						dw_job_id = $5,
						job_started = CURRENT_TIMESTAMP,
						total_rows = 0,
						bytes_processed = 0,
						result_size = 0,
						updated_at=now()
					where id  = $2`,
					status,
					job.GetQueryID(),
					job.Err(),
					job.GetResultID(),
					job.GetDWJobID(),
				)

			} else {
				_, err = s.db.ExecContext(
					ctx,
					`update queries set
						job_status = $1,
						job_error = $3,
						job_result_id = $4,
						total_rows = $5,
						bytes_processed = $6,
						result_size = $7,
						dw_job_id = $8,
						updated_at=now()
					where id  = $2`,
					status,
					job.GetQueryID(),
					job.Err(),
					job.GetResultID(),
					job.GetTotalRows(),
					job.GetProcessedBytes(),
					job.GetResultSize(),
					job.GetDWJobID(),
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
