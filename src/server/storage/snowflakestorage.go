package storage

import (
	"context"
	"database/sql"
	"encoding/csv"
	"fmt"
	"io"
	"os"
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
	dataSourceName := fmt.Sprintf(
		"%s:%s@%s",
		os.Getenv("DEKART_SNOWFLAKE_USER"),
		os.Getenv("DEKART_SNOWFLAKE_PASSWORD"),
		os.Getenv("DEKART_SNOWFLAKE_ACCOUNT_ID"),
	)
	parts := strings.Split(fileName, ".")
	queryID := parts[0] //extract queryID from fileName like 01b3b0ae-0102-9b06-0001-c28e001599fe.csv

	return SnowflakeStorageObject{queryID: queryID, dataSourceName: dataSourceName}
}

// SnowflakeStorageObject
type SnowflakeStorageObject struct {
	queryID        string
	dataSourceName string
}

func (s SnowflakeStorageObject) CanSaveQuery() bool {
	return false
}

func (s SnowflakeStorageObject) GetReader(ctx context.Context) (io.ReadCloser, error) {
	log.Debug().Str("queryID", s.queryID).Msg("GetReader")
	fetchResultByIDCtx := sf.WithFetchResultByID(ctx, s.queryID)
	db, err := sql.Open("snowflake", s.dataSourceName)
	if err != nil {
		log.Error().Err(err).Msg("failed to connect to snowflake")
		return nil, err
	}
	rows, err := db.QueryContext(fetchResultByIDCtx, "")
	if err != nil {
		log.Error().Err(err).Msg("failed to query snowflake")
		return nil, err
	}
	pr, pw := io.Pipe()
	csvWriter := csv.NewWriter(pw)
	go func() {
		//TODO: too long function
		defer rows.Close()
		//TODO: copy paste from snowflakejob.go
		firstRow := true
		for rows.Next() {
			columnTypes, err := rows.ColumnTypes()
			if err != nil {
				log.Error().Err(err).Msg("Error getting column types")
				pw.CloseWithError(err)
				return
			}
			if firstRow {
				firstRow = false
				columnNames := make([]string, len(columnTypes))
				for i, columnType := range columnTypes {
					columnNames[i] = columnType.Name()
				}
				err := csvWriter.Write(columnNames)
				if err != nil {
					log.Error().Err(err).Msg("Error writing column names")
					pw.CloseWithError(err)
					return
				}

			}

			csvRow := make([]string, len(columnTypes))
			values := make([]interface{}, len(columnTypes))
			for i := range columnTypes {
				values[i] = new(sql.NullString)
			}
			rows.Scan(values...)

			for i := range columnTypes {
				value := values[i]
				switch x := value.(type) {
				case *sql.NullString:
					csvRow[i] = x.String
				default:
					pw.CloseWithError(fmt.Errorf("incorrect type of data: %T", x))
					return
				}
			}
			err = csvWriter.Write(csvRow)
			if err != nil {
				log.Error().Err(err).Msg("Error writing column names")
				pw.CloseWithError(err)
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

func (s SnowflakeStorageObject) GetCreatedAt(context.Context) (*time.Time, error) {
	return nil, nil
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
