package pgjob

import (
	"context"
	"database/sql"
	"encoding/csv"
	"fmt"
	"io"
	"os"

	"dekart/src/proto"
	"dekart/src/server/job"
	"dekart/src/server/storage"

	_ "github.com/lib/pq" // postgres driver
	"github.com/rs/zerolog/log"
)

type Job struct {
	job.BasicJob
	postgresDB    *sql.DB
	storageObject storage.StorageObject
}

type Store struct {
	job.BasicStore
	postgresDB *sql.DB
}

func NewStore() *Store {
	dbConnStr := os.Getenv("DEKART_POSTGRES_DATASOURCE_CONNECTION")
	db, err := sql.Open("postgres", dbConnStr)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to postgres")
	}

	return &Store{
		postgresDB: db,
	}
}

func (s *Store) Create(reportID string, queryID string, queryText string, userCtx context.Context) (job.Job, chan int32, error) {
	j := &Job{
		BasicJob: job.BasicJob{
			ReportID:  reportID,
			QueryID:   queryID,
			QueryText: queryText,
			Logger:    log.With().Str("reportID", reportID).Str("queryID", queryID).Logger(),
		},
		postgresDB: s.postgresDB,
	}

	j.Init(userCtx)
	s.StoreJob(j)
	go s.RemoveJobWhenDone(j)
	return j, j.Status(), nil
}

func (j *Job) Run(storageObject storage.StorageObject, connection *proto.Connection) error {
	j.Status() <- int32(proto.Query_JOB_STATUS_RUNNING)
	j.storageObject = storageObject

	rows, err := j.postgresDB.QueryContext(j.GetCtx(), j.QueryText)
	if err != nil {
		j.Logger.Error().Err(err).Str("queryText", j.QueryText).Msg("Error executing query")
		j.CancelWithError(err)
		return err
	}
	defer rows.Close()

	csvRows := make(chan []string, 10_000)

	go j.write(csvRows)

	columnTypes, err := rows.ColumnTypes()
	if err != nil {
		j.Logger.Error().Err(err).Msg("Error getting column types")
		j.CancelWithError(err)
		return err
	}

	firstRow := true
	for rows.Next() {
		if firstRow {
			firstRow = false
			j.Status() <- int32(proto.Query_JOB_STATUS_READING_RESULTS)
			columnNames := make([]string, len(columnTypes))
			for i, columnType := range columnTypes {
				columnNames[i] = columnType.Name()
			}
			csvRows <- columnNames
		}

		csvRow := make([]string, len(columnTypes))
		values := make([]interface{}, len(columnTypes))
		for i := range columnTypes {
			values[i] = new(sql.NullString)
		}

		err = rows.Scan(values...)
		if err != nil {
			j.Logger.Error().Err(err).Msg("Error scanning rows")
			j.Logger.Warn().Err(err).Msg("Error scanning row, continuing with next")
			continue
		}

		for i := range columnTypes {
			value := values[i]
			switch x := value.(type) {
			case *sql.NullString:
				csvRow[i] = x.String
			default:
				return fmt.Errorf("incorrect type of data: %T", x)
			}
		}
		csvRows <- csvRow
	}

	close(csvRows)
	j.Status() <- int32(proto.Query_JOB_STATUS_DONE)
	return nil
}

func (j *Job) write(csvRows chan []string) {
	storageWriter := j.storageObject.GetWriter(j.GetCtx())
	csvWriter := csv.NewWriter(storageWriter)
	for {
		csvRow, more := <-csvRows
		if !more {
			break
		}
		err := csvWriter.Write(csvRow)
		if err == context.Canceled {
			break
		}
		if err != nil {
			j.Logger.Err(err).Send()
			j.CancelWithError(err)
			break
		}
	}
	j.close(storageWriter, csvWriter)
}

func (j *Job) close(storageWriter io.WriteCloser, csvWriter *csv.Writer) {
	csvWriter.Flush()
	err := storageWriter.Close()
	if err != nil {
		// Ensure all resources are properly released even when context is canceled
		if err == context.Canceled {
			return
		}
		j.Logger.Err(err).Send()
		j.CancelWithError(err)
		return
	}
	resultSize, err := j.storageObject.GetSize(j.GetCtx())
	if err != nil {
		j.Logger.Err(err).Send()
		j.CancelWithError(err)
		return
	}

	j.Logger.Debug().Msg("Writing Done")

	j.Lock()
	j.ResultSize = *resultSize
	j.ResultReady = true
	j.Unlock()

	j.Status() <- int32(proto.Query_JOB_STATUS_DONE)
	j.Cancel()
}
