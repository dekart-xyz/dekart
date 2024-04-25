package storage

import (
	"context"
	"database/sql"
	"dekart/src/server/snowflakeutils"
	"encoding/csv"
	"io"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
	sf "github.com/snowflakedb/gosnowflake"
)

type SnowflakeStorage struct {
	// logger zerolog.Logger
}

func NewSnowflakeStorage() *SnowflakeStorage {
	return &SnowflakeStorage{}
}

func (s *SnowflakeStorage) CanSaveQuery() bool {
	return false
}

func (s *SnowflakeStorage) GetObject(_ string, queryID string) StorageObject {
	return NewSnowflakeStorageObject(queryID)
}

// NewSnowflakeStorageObject
func NewSnowflakeStorageObject(fileName string) StorageObject {
	connector := snowflakeutils.GetConnector()
	parts := strings.Split(fileName, ".")
	queryID := parts[0] //extract queryID from fileName like 01b3b0ae-0102-9b06-0001-c28e001599fe.csv

	return SnowflakeStorageObject{queryID: queryID, connector: connector}
}

// SnowflakeStorageObject
type SnowflakeStorageObject struct {
	queryID   string
	connector sf.Connector
}

func (s SnowflakeStorageObject) CanSaveQuery() bool {
	return false
}

func (s SnowflakeStorageObject) GetReader(ctx context.Context) (io.ReadCloser, error) {
	log.Debug().Str("queryID", s.queryID).Msg("GetReader")
	fetchResultByIDCtx := sf.WithFetchResultByID(ctx, s.queryID)
	db := sql.OpenDB(s.connector)
	rows, err := db.QueryContext(fetchResultByIDCtx, "")
	if err != nil {
		if sfErr, ok := err.(*sf.SnowflakeError); ok {
			if sfErr.Number == 612 {
				return nil, &ExpiredError{}
			}
		}
		log.Error().Err(err).Msg("failed to query snowflake")
		return nil, err
	}
	pr, pw := io.Pipe()
	csvWriter := csv.NewWriter(pw)
	go func() {
		defer rows.Close()
		firstRow := true
		for rows.Next() {
			if firstRow {
				firstRow = false
				columnNames, err := snowflakeutils.GetColumns(rows)
				if err != nil {
					log.Error().Err(err).Msg("Error getting column names")
					return
				}
				err = csvWriter.Write(columnNames)
				if err != nil {
					log.Error().Err(err).Msg("Error writing column names")
					return
				}

			}
			csvRow, err := snowflakeutils.GetRow(rows)
			if err != nil {
				log.Error().Err(err).Msg("Error getting row")
				return
			}
			err = csvWriter.Write(csvRow)
			if err != nil {
				log.Error().Err(err).Msg("Error writing column names")
				return
			}
		}
		csvWriter.Flush()
		err := pw.Close()
		if err != nil {
			log.Error().Err(err).Msg("Error closing pipe writer")
		}
	}()

	return pr, nil
}

func (s SnowflakeStorageObject) GetWriter(ctx context.Context) io.WriteCloser {
	log.Fatal().Msg("not implemented")
	return nil
}

func (s SnowflakeStorageObject) GetCreatedAt(ctx context.Context) (*time.Time, error) {
	conn, err := s.connector.Connect(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	status, err := conn.(sf.SnowflakeConnection).GetQueryStatus(ctx, s.queryID)

	if err != nil {
		log.Warn().Err(err).Msg("failed to get query status")
		return nil, &ExpiredError{}
	}
	createdAt := time.Unix(status.EndTime/1000, 0)

	log.Debug().Str("queryID", s.queryID).Time("createdAt", createdAt).Msg("GetCreatedAt")

	//check if query is older than 1 day (minus 1 hour for safety)
	if time.Since(createdAt) > 23*time.Hour {
		return nil, &ExpiredError{}
	}
	return &createdAt, nil
}

// GetSize(context.Context) (*int64, error)
func (s SnowflakeStorageObject) GetSize(ctx context.Context) (*int64, error) {
	return nil, nil
}

// CopyFromS3(ctx context.Context, source string) error
func (s SnowflakeStorageObject) CopyFromS3(ctx context.Context, source string) error {
	log.Fatal().Msg("not implemented")
	return nil
}
