package snowflakejob

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/job"
	"dekart/src/server/snowflakeutils"
	"dekart/src/server/storage"
	"encoding/csv"
	"io"
	"regexp"
	"sync"

	"github.com/rs/zerolog/log"
	sf "github.com/snowflakedb/gosnowflake"
)

type Job struct {
	job.BasicJob
	snowflakeDb              *sql.DB
	storageObject            storage.StorageObject
	connector                sf.Connector
	isSnowflakeStorageObject bool
}

type Store struct {
	job.BasicStore
}

func NewStore() *Store {
	store := &Store{}
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
	j.ResultID = &jobID // results available now
	j.Unlock()
	j.Status() <- int32(proto.Query_JOB_STATUS_DONE)
	j.Cancel()
}

func (j *Job) fetchQueryMetadata(queryIDChan chan string, resultsReady chan bool, wg *sync.WaitGroup) {
	ctx := j.GetCtx()
	defer wg.Done()
	select {
	case queryID := <-queryIDChan:
		select {
		case <-ctx.Done():
			j.Logger.Warn().Msg("Context Done before query status received")
			return
		case <-resultsReady:
			conn, err := j.connector.Connect(ctx)
			if err != nil {
				j.Logger.Err(err).Send()
				j.CancelWithError(err)
				return
			}
			status, err := conn.(sf.SnowflakeConnection).GetQueryStatus(ctx, queryID)
			if err != nil {
				j.Logger.Err(err).Send()
				j.CancelWithError(err)
				return
			}
			j.Lock()
			if j.isSnowflakeStorageObject {
				// when using SNOWFLAKE storage, resultID is same as queryID and available immediately
				j.ResultID = &queryID
			}
			j.ProcessedBytes = status.ScanBytes
			j.Unlock()
			return
		}
	case <-ctx.Done():
		j.Logger.Warn().Msg("Context Done before queryID received")
	}

}

func (j *Job) Run(storageObject storage.StorageObject, connection *proto.Connection) error {
	j.storageObject = storageObject
	_, isSnowflakeStorageObject := j.storageObject.(storage.SnowflakeStorageObject)
	j.isSnowflakeStorageObject = isSnowflakeStorageObject
	queryIDChan := make(chan string)
	resultsReady := make(chan bool)
	metadataWg := &sync.WaitGroup{}
	metadataWg.Add(1)
	go j.fetchQueryMetadata(queryIDChan, resultsReady, metadataWg)
	j.Status() <- int32(proto.Query_JOB_STATUS_RUNNING)
	// TODO will this just work: queryID = rows1.(sf.SnowflakeRows).GetQueryID()
	// https://pkg.go.dev/github.com/snowflakedb/gosnowflake#hdr-Fetch_Results_by_Query_ID
	rows, err := j.snowflakeDb.QueryContext(
		sf.WithQueryIDChan(j.GetCtx(), queryIDChan),
		j.QueryText,
	)
	if err != nil {
		j.Logger.Debug().Err(err).Msg("Error querying snowflake")
		j.CancelWithError(err)
		return nil // it's ok, since these are query errors
	}
	defer rows.Close()

	if isSnowflakeStorageObject { // no need to write to storage, use temp query results storage
		resultsReady <- true
		defer (func() {
			j.Status() <- int32(proto.Query_JOB_STATUS_DONE)
		})()
	} else {
		csvRows := make(chan []string, 10) //j.TotalRows?

		go j.write(csvRows)

		firstRow := true
		for rows.Next() {
			if firstRow {
				firstRow = false
				resultsReady <- true
				j.Status() <- int32(proto.Query_JOB_STATUS_READING_RESULTS)
				columnNames, err := snowflakeutils.GetColumns(rows)
				if err != nil {
					j.Logger.Error().Err(err).Msg("Error getting column names")
					j.CancelWithError(err)
					return err
				}
				csvRows <- columnNames
			}

			csvRow, err := snowflakeutils.GetRow(rows)
			if err != nil {
				j.Logger.Error().Err(err).Msg("Error getting column names")
				j.CancelWithError(err)
				return err
			}
			csvRows <- csvRow
		}

		if firstRow {
			// unblock fetchQueryMetadata if no rows
			resultsReady <- true
		}
		defer close(csvRows)
	}

	metadataWg.Wait() // do not close context until metadata is fetched
	return nil
}

func (s *Store) Create(reportID string, queryID string, queryText string, userCtx context.Context) (job.Job, chan int32, error) {
	connector := snowflakeutils.GetConnector()
	db := sql.OpenDB(connector)
	err := db.Ping()
	if err != nil {
		log.Error().Err(err).Msg("Failed to ping snowflake")
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
		connector:   connector,
	}
	job.Init(userCtx)
	s.StoreJob(job)
	go s.RemoveJobWhenDone(job)
	return job, job.Status(), nil
}
