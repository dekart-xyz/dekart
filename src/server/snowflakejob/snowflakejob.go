package snowflakejob

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/job"
	"dekart/src/server/storage"
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"regexp"

	"github.com/rs/zerolog/log"
	sf "github.com/snowflakedb/gosnowflake"
)

type Job struct {
	job.BasicJob
	snowflakeDb   *sql.DB
	storageObject storage.StorageObject
}

type Store struct {
	job.BasicStore
	Jobs []*Job
}

func NewStore() *Store {
	store := &Store{}
	store.Jobs = make([]*Job, 0)
	return store
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

var contextCancelledRe = regexp.MustCompile(`context canceled`)

func (j *Job) close(storageWriter io.WriteCloser, csvWriter *csv.Writer) {
	csvWriter.Flush()
	err := storageWriter.Close()
	if err != nil {
		// maybe we should not close when context is canceled in job.write()
		if err == context.Canceled {
			return
		}
		if contextCancelledRe.MatchString(err.Error()) {
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
	jobID := j.GetID()
	j.ResultID = &jobID
	j.Unlock()
	j.Status() <- int32(proto.Query_JOB_STATUS_DONE)
	j.Cancel()
}

func (j *Job) fetchQueryMetadata(queryIDChan chan string) {
	ctx := j.GetCtx()
	select {
	case queryID := <-queryIDChan:
		fmt.Printf("Query ID: %v", queryID)
		// var con interface{} = *j.snowflakeDb
		// status, err := con.(sf.SnowflakeConnection).GetQueryStatus(ctx, queryID)
		// if err != nil {
		// 	j.Logger.Err(err).Send()
		// 	j.CancelWithError(err)
		// 	return
		// }
		// fmt.Printf("Query Status: %v", status)

	case <-ctx.Done():
		j.Logger.Debug().Msg("Context Done before queryID received")
	}

}

func (j *Job) Run(storageObject storage.StorageObject) error {
	j.storageObject = storageObject
	j.ProcessedBytes = 1
	j.Status() <- int32(proto.Query_JOB_STATUS_PENDING)
	j.Status() <- int32(proto.Query_JOB_STATUS_RUNNING)
	queryIDChan := make(chan string)
	go j.fetchQueryMetadata(queryIDChan)
	rows, err := j.snowflakeDb.QueryContext(
		sf.WithQueryIDChan(j.GetCtx(), queryIDChan),
		j.QueryText,
	)
	if err != nil {
		j.Logger.Error().Err(err).Msg("Error starting query execution")
		j.CancelWithError(err)
		return err
	}
	defer rows.Close()
	j.Status() <- int32(proto.Query_JOB_STATUS_READING_RESULTS)
	csvRows := make(chan []string, 10) //j.TotalRows?

	go j.write(csvRows)

	firstRow := true

	for rows.Next() {
		columnTypes, err := rows.ColumnTypes()
		if err != nil {
			j.Logger.Error().Err(err).Msg("Error getting column types")
			j.CancelWithError(err)
			return err
		}
		if firstRow {
			firstRow = false
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
		rows.Scan(values...)

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
	close(csvRows) //better to close in defer?
	return nil
}

func (s *Store) Create(reportID string, queryID string, queryText string) (job.Job, chan int32, error) {
	s.Lock()
	defer s.Unlock()

	db, err := sql.Open("snowflake", fmt.Sprintf(
		"%s:%s@EHFDLAI-%s",
		os.Getenv("DEKART_SNOWFLAKE_USER"),
		os.Getenv("DEKART_SNOWFLAKE_PASSWORD"),
		os.Getenv("DEKART_SNOWFLAKE_ACCOUNT"),
	))
	if err != nil {
		log.Error().Err(err).Msg("failed to connect to snowflake")
		return nil, nil, err
	}
	job := &Job{
		BasicJob: job.BasicJob{
			ReportID:  reportID,
			QueryID:   queryID,
			QueryText: queryText,
			Logger:    log.With().Str("reportID", reportID).Str("queryID", queryID).Logger(),
		},
		snowflakeDb: db,
	}
	job.Init()
	s.Jobs = append(s.Jobs, job)
	go s.RemoveJobWhenDone(job)
	return job, job.Status(), nil
}
