package bqjob

import (
	"dekart/src/server/job"
	"os"
	"strconv"

	"github.com/rs/zerolog/log"
)

// Store implements dekart.JobStore interface for BigQuery
type Store struct {
	job.BasicStore
	Jobs []*Job
}

// NewStore instance
func NewStore() *Store {
	store := &Store{}
	store.Jobs = make([]*Job, 0)
	return store
}

// func (s *Store) removeJobWhenDone(job *Job) {
// 	<-job.ctx.Done()
// 	s.mutex.Lock()
// 	for i, j := range s.jobs {
// 		if job.id == j.id {
// 			// removing job from slice
// 			last := len(s.jobs) - 1
// 			s.jobs[i] = s.jobs[last]
// 			s.jobs = s.jobs[:last]
// 			break
// 		}
// 	}
// 	s.mutex.Unlock()
// }

// Create job on store
func (s *Store) Create(reportID string, queryID string, queryText string) (job.Job, chan int32, error) {
	maxBytesBilledStr := os.Getenv("DEKART_BIGQUERY_MAX_BYTES_BILLED")
	var maxBytesBilled int64
	var err error
	if maxBytesBilledStr != "" {
		maxBytesBilled, err = strconv.ParseInt(maxBytesBilledStr, 10, 64)
		if err != nil {
			log.Fatal().Msgf("Cannot parse DEKART_BIGQUERY_MAX_BYTES_BILLED")
			return nil, nil, err
		}
	} else {
		log.Warn().Msgf("DEKART_BIGQUERY_MAX_BYTES_BILLED is not set! Use the maximum bytes billed setting to limit query costs. https://cloud.google.com/bigquery/docs/best-practices-costs#limit_query_costs_by_restricting_the_number_of_bytes_billed")
	}
	s.Lock()
	defer s.Unlock()
	job := &Job{
		BasicJob: job.BasicJob{
			ReportID:  reportID,
			QueryID:   queryID,
			QueryText: queryText,
			Logger:    log.With().Str("reportID", reportID).Str("queryID", queryID).Logger(),
		},
		maxBytesBilled: maxBytesBilled,
	}
	job.Init()
	s.Jobs = append(s.Jobs, job)
	go s.RemoveJobWhenDone(job)
	return job, job.Status(), nil
}

// Cancel job for queryID
// func (s *Store) Cancel(queryID string) bool {
// 	s.mutex.Lock()
// 	defer s.mutex.Unlock()
// 	for _, job := range s.jobs {
// 		if job.QueryID == queryID {
// 			job.Status() <- int32(proto.Query_JOB_STATUS_UNSPECIFIED)
// 			job.Logger.Info().Msg("Canceling Job Context")
// 			job.Cancel()
// 			return true
// 		}
// 	}
// 	return false
// }

// CancelAll jobs
// func (s *Store) CancelAll(ctx context.Context) {
// 	s.mutex.Lock()
// 	for _, job := range s.jobs {
// 		job.logger.Debug().Msg("Canceling Job")
// 		select {
// 		case job.status <- int32(proto.Query_JOB_STATUS_UNSPECIFIED):
// 			job.logger.Info().Msg("Updated status")
// 		case <-ctx.Done():
// 			job.logger.Warn().Msg("Timeout canceling Job")
// 		}
// 		job.cancel()
// 		job.logger.Info().Msg("Canceled context")
// 	}
// 	s.mutex.Unlock()
// }
