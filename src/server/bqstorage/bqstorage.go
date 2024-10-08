package bqstorage

import (
	"context"
	"dekart/src/server/bqutils"
	"dekart/src/server/errtype"
	"dekart/src/server/user"
	"encoding/csv"
	"fmt"
	"io"
	"time"

	"cloud.google.com/go/bigquery"
	"github.com/rs/zerolog/log"
	"google.golang.org/api/option"
)

// BigQueryStorageObject implements StorageObject interface for BigQuery temp results tables
type BigQueryStorageObject struct {
	JobID             string
	BigqueryProjectId string
}

func (s BigQueryStorageObject) GetWriter(ctx context.Context) io.WriteCloser {
	log.Fatal().Msg("BigQueryStorageObject GetWriter not implemented")
	return nil
}

func (s BigQueryStorageObject) GetSize(ctx context.Context) (*int64, error) {
	err := fmt.Errorf("BigQueryStorageObject GetSize not implemented")
	log.Err(err).Send()
	return nil, err
}

func (s BigQueryStorageObject) getClient(ctx context.Context) (*bigquery.Client, error) {
	tokenSource := user.GetTokenSource(ctx)
	if tokenSource == nil {
		return nil, fmt.Errorf("no token source")
	}
	client, err := bigquery.NewClient(
		ctx,
		s.BigqueryProjectId,
		option.WithTokenSource(tokenSource),
	)
	if err != nil {
		return nil, err
	}
	return client, nil
}

func (s BigQueryStorageObject) GetCreatedAt(ctx context.Context) (*time.Time, error) {
	log.Debug().Str("jobID", s.JobID).Msg("BigQueryStorageObject GetCreatedAt")
	client, err := s.getClient(ctx)
	if err != nil {
		return nil, err
	}
	jobFromJobId, err := client.JobFromID(ctx, s.JobID)
	if err != nil {
		return nil, err
	}
	endTime := jobFromJobId.LastStatus().Statistics.EndTime

	if time.Since(endTime) > 23*time.Hour {
		return nil, &errtype.Expired{}
	}

	return &endTime, nil
}

func (s BigQueryStorageObject) GetReader(ctx context.Context) (io.ReadCloser, error) {
	log.Debug().Str("jobID", s.JobID).Msg("BigQueryStorageObject GetReader")
	client, err := s.getClient(ctx)
	if err != nil {
		return nil, err
	}
	jobFromJobId, err := client.JobFromID(ctx, s.JobID)
	if err != nil {
		return nil, err
	}
	table, err := bqutils.GetTableFromJob(jobFromJobId)
	if err != nil {
		return nil, err
	}
	csvRows := make(chan []string, 10)
	errors := make(chan error)

	go bqutils.Read(
		ctx,
		errors,
		csvRows,
		table,
		log.Logger,
		10,
	)
	pr, pw := io.Pipe()
	csvWriter := csv.NewWriter(pw)
	var firstRow []string
	var more bool

	// read first row, make sure it's not an error
	// this is needed because if user doesn't have permission to create read session, error will be returned in the channel
	select {
	case firstRow, more = <-csvRows:
		if !more {
			err := fmt.Errorf("no data returned by BigQuery Readers")
			log.Err(err).Send()
			return nil, err
		}
	case err := <-errors:
		return nil, err
	}

	go func() {
		defer pw.Close()
		defer csvWriter.Flush()

		if more {
			// write first row
			log.Debug().Msg("writing first row")
			err := csvWriter.Write(firstRow)
			if err != nil {
				log.Err(err).Send()
				return
			}

			// continue writing rows
			for {
				select {
				case csvRow, more := <-csvRows:
					if !more {
						return
					}
					err := csvWriter.Write(csvRow)
					if err != nil {
						log.Err(err).Send()
						return
					}
				case err := <-errors:
					if err != nil {
						log.Err(err).Send()
						return
					}
				case <-ctx.Done():
					log.Debug().Msg("context canceled")
					return
				}
			}
		}
	}()

	return pr, nil
}

func (s BigQueryStorageObject) CopyFromS3(ctx context.Context, source string) error {
	err := fmt.Errorf("BigQueryStorageObject CopyFromS3 not implemented")
	log.Fatal().Err(err).Send()
	return err
}

func (s BigQueryStorageObject) Delete(ctx context.Context) error {
	log.Fatal().Msg("BigQueryStorageObject Delete not implemented")
	return nil
}

func (s BigQueryStorageObject) CopyTo(ctx context.Context, writer io.WriteCloser) error {
	reader, err := s.GetReader(ctx)
	if err != nil {
		log.Err(err).Msg("Error getting reader while copying to")
		return err
	}
	_, err = io.Copy(writer, reader)
	if err != nil {
		return err
	}
	err = writer.Close()
	if err != nil {
		return err
	}
	return nil
}
