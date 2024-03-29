package bqjob

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/job"
	"dekart/src/server/user"
	"os"
	"strconv"

	"cloud.google.com/go/bigquery"
	"github.com/rs/zerolog/log"
	"google.golang.org/api/option"
)

// Store implements job.Store interface for BigQuery
type Store struct {
	job.BasicStore
}

// NewStore instance
func NewStore() *Store {
	store := &Store{}
	return store
}

// Create job on store
func (s *Store) Create(reportID string, queryID string, queryText string, userCtx context.Context) (job.Job, chan int32, error) {
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
	job.Init(userCtx)
	s.StoreJob(job)
	go s.RemoveJobWhenDone(job)
	return job, job.Status(), nil
}

func (s *Store) TestConnection(ctx context.Context, req *proto.TestConnectionRequest) (*proto.TestConnectionResponse, error) {
	tokenSource := user.GetTokenSource(ctx)
	client, err := bigquery.NewClient(
		ctx,
		req.Connection.BigqueryProjectId,
		option.WithTokenSource(tokenSource),
	)
	if err != nil {
		log.Debug().Err(err).Msg("bigquery.NewClient failed")
		return &proto.TestConnectionResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}
	it := client.Datasets(ctx)
	_, err = it.Next()
	if err != nil {
		log.Debug().Err(err).Msg("client.Datasets failed")
		return &proto.TestConnectionResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}

	return &proto.TestConnectionResponse{
		Success: true,
	}, nil
}
