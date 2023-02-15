package bqjob

import (
	"dekart/src/server/job"
	"os"
	"strconv"

	"github.com/rs/zerolog/log"
)

// Store implements job.Store interface for BigQuery
type Store struct {
	job.BasicStore
	// Jobs []*Job
}

// NewStore instance
func NewStore() *Store {
	store := &Store{}
	// store.Jobs = make([]*Job, 0)
	return store
}

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
	s.StoreJob(job)
	go s.RemoveJobWhenDone(job)
	return job, job.Status(), nil
}
