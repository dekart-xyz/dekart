package bqjob

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/job"
	"dekart/src/server/user"
	"os"
	"strconv"
	"strings"

	"cloud.google.com/go/bigquery"
	bqStorage "cloud.google.com/go/bigquery/storage/apiv1"
	"github.com/rs/zerolog/log"
	"google.golang.org/api/iterator"
	"google.golang.org/api/option"
	bqStoragePb "google.golang.org/genproto/googleapis/cloud/bigquery/storage/v1"
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

func Create(reportID string, queryID string, queryText string, userCtx context.Context) (job.Job, error) {
	maxBytesBilledStr := os.Getenv("DEKART_BIGQUERY_MAX_BYTES_BILLED")
	var maxBytesBilled int64
	var err error
	if user.CheckWorkspaceCtx(userCtx).IsPlayground {
		// In playground mode, we don't want to allow users to run queries that could cost us money.
		if maxBytesBilledStr != "" {
			maxBytesBilled, err = strconv.ParseInt(maxBytesBilledStr, 10, 64)
			if err != nil {
				log.Fatal().Msgf("Cannot parse DEKART_BIGQUERY_MAX_BYTES_BILLED")
				return nil, err
			}
		} else {
			log.Warn().Msgf("DEKART_BIGQUERY_MAX_BYTES_BILLED is not set! Use the maximum bytes billed setting to limit query costs. https://cloud.google.com/bigquery/docs/best-practices-costs#limit_query_costs_by_restricting_the_number_of_bytes_billed")
		}
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
	return job, nil
}

// Create job on store
func (s *Store) Create(reportID string, queryID string, queryText string, userCtx context.Context) (job.Job, chan int32, error) {
	job, err := Create(reportID, queryID, queryText, userCtx)
	if err != nil {
		log.Error().Err(err).Msg("Failed to create BigQuery job")
		return nil, nil, err
	}
	s.StoreJob(job)
	go s.RemoveJobWhenDone(job)
	return job, job.Status(), nil
}

func (s *Store) TestConnection(ctx context.Context, req *proto.TestConnectionRequest) (*proto.TestConnectionResponse, error) {
	return TestConnection(ctx, req)
}

func TestConnection(ctx context.Context, req *proto.TestConnectionRequest) (*proto.TestConnectionResponse, error) {
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
		if err != iterator.Done { // if no datasets found, it still ok
			return &proto.TestConnectionResponse{
				Success: false,
				Error:   err.Error(),
			}, nil
		}
	}

	// Attempt to create a read session to check for permissions
	bqReadClient, err := bqStorage.NewBigQueryReadClient(ctx, option.WithTokenSource(tokenSource))
	if err != nil {
		log.Debug().Err(err).Msg("bigquery.NewBigQueryReadClient failed")
		return &proto.TestConnectionResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}
	defer bqReadClient.Close()

	createReadSessionRequest := &bqStoragePb.CreateReadSessionRequest{
		Parent: "projects/" + req.Connection.BigqueryProjectId,
		ReadSession: &bqStoragePb.ReadSession{
			Table:      "projects/bigquery-public-data/datasets/samples/tables/shakespeare", // well-known public dataset
			DataFormat: bqStoragePb.DataFormat_AVRO,
		},
	}
	_, err = bqReadClient.CreateReadSession(ctx, createReadSessionRequest)
	if err != nil {
		if strings.Contains(err.Error(), "PermissionDenied") {
			return &proto.TestConnectionResponse{
				Success: false,
				Error:   err.Error(),
			}, nil
		}
	}
	return &proto.TestConnectionResponse{
		Success: true,
	}, nil
}
