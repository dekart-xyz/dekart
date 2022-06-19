package bqjob

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/dekart"
	"dekart/src/server/uuid"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

// Store implements dekart.JobStore interface for BigQuery
type Store struct {
	jobs  []*Job
	mutex sync.Mutex
}

// NewStore instance
func NewStore() *Store {
	store := &Store{}
	store.jobs = make([]*Job, 0)
	return store
}

func (s *Store) removeJobWhenDone(job *Job) {
	<-job.ctx.Done()
	s.mutex.Lock()
	for i, j := range s.jobs {
		if job.id == j.id {
			// removing job from slice
			last := len(s.jobs) - 1
			s.jobs[i] = s.jobs[last]
			s.jobs = s.jobs[:last]
			break
		}
	}
	s.mutex.Unlock()
}

// Create job on store
func (s *Store) Create(reportID string, queryID string, queryText string) (dekart.Job, chan int32, error) {
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
	s.mutex.Lock()
	defer s.mutex.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	status := make(chan int32)
	job := &Job{
		id:             uuid.GetUUID(),
		reportID:       reportID,
		queryID:        queryID,
		ctx:            ctx,
		cancel:         cancel,
		status:         status,
		logger:         log.With().Str("reportID", reportID).Str("queryID", queryID).Logger(),
		maxBytesBilled: maxBytesBilled,
		queryText:      queryText,
	}

	s.jobs = append(s.jobs, job)
	go s.removeJobWhenDone(job)
	return job, status, nil
}

// Cancel job for queryID
func (s *Store) Cancel(queryID string) {
	s.mutex.Lock()
	for _, job := range s.jobs {
		if job.queryID == queryID {
			job.status <- int32(proto.Query_JOB_STATUS_UNSPECIFIED)
			job.logger.Info().Msg("Canceling Job Context")
			job.cancel()
		}
	}
	s.mutex.Unlock()
}
