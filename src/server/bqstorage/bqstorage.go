package bqstorage

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/bqutils"
	"dekart/src/server/conn"
	"dekart/src/server/deadline"
	"dekart/src/server/errtype"
	"encoding/csv"
	"fmt"
	"io"
	"time"

	"cloud.google.com/go/bigquery"
	"github.com/rs/zerolog/log"
)

// BigQueryStorageObject implements StorageObject interface for BigQuery temp results tables
type BigQueryStorageObject struct {
	JobID      string
	Connection *proto.Connection
}

func (s BigQueryStorageObject) GetWriter(ctx context.Context) io.WriteCloser {
	log.Fatal().Msg("BigQueryStorageObject GetWriter not implemented")
	return nil
}

func (s BigQueryStorageObject) GetSize(ctx context.Context) (*int64, error) {
	log.Fatal().Msg("BigQueryStorageObject GetSize not implemented")
	return nil, nil
}

func (s BigQueryStorageObject) getClient(ctx context.Context) (*bigquery.Client, error) {
	client, err := bqutils.GetClient(ctx, s.Connection)
	if err != nil {
		return nil, err
	}
	return client, nil
}

func (s BigQueryStorageObject) GetCreatedAt(ctx context.Context) (*time.Time, error) {
	client, err := s.getClient(ctx)
	if err != nil {
		return nil, err
	}
	jobFromJobId, err := client.JobFromID(ctx, s.JobID)
	if err != nil {
		return nil, err
	}
	endTime := jobFromJobId.LastStatus().Statistics.EndTime

	if time.Since(endTime) > deadline.GetQueryCacheDeadline() {
		return nil, &errtype.Expired{}
	}

	return &endTime, nil
}

func (s BigQueryStorageObject) GetReader(ctx context.Context) (io.ReadCloser, error) {
	connCtx := conn.GetCtx(ctx, s.Connection)
	client, err := s.getClient(ctx)
	if err != nil {
		return nil, err
	}
	jobFromJobId, err := client.JobFromID(connCtx, s.JobID)
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
		connCtx,
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
			log.Err(err).Send() // here send is ok
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
			err := csvWriter.Write(firstRow)
			if err != nil {
				log.Err(err).Msg("error writing first row")
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
						log.Err(err).Msg("error writing row")
						return
					}
				case err := <-errors:
					if err != nil {
						log.Err(err).Msg("error reading row")
						return
					}
				case <-ctx.Done():
					log.Warn().Msg("context canceled while reading BigQuery rows")
					return
				}
			}
		}
	}()

	return pr, nil
}

func (s BigQueryStorageObject) CopyFromS3(ctx context.Context, source string) error {
	err := fmt.Errorf("BigQueryStorageObject CopyFromS3 not implemented")
	log.Fatal().Err(err).Send() // here send is ok
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
