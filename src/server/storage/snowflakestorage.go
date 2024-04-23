package storage

import (
	"context"
	"database/sql"
	"dekart/src/server/snowflakeconn"
	"encoding/csv"
	"fmt"
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
	connector := snowflakeconn.GetConnector()
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

func (s SnowflakeStorageObject) GetCreatedAt(ctx context.Context) (*time.Time, error) {
	// randomly return expired error every second time for testing
	// if rand.Intn(2) == 0 {
	// 	return nil, &ExpiredError{}
	// }

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
	createdAt := time.Unix(status.EndTime, 0)

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
