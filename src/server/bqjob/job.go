package bqjob

import (
	"dekart/src/proto"
	"dekart/src/server/storage"
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"reflect"
	"regexp"
	"sync"

	"context"

	"cloud.google.com/go/bigquery"
	"github.com/rs/zerolog"
	"google.golang.org/api/googleapi"
)

// Job implements the dekart.Job interface for BigQuery; concurency safe.
type Job struct {
	id                  string
	queryID             string
	reportID            string
	ctx                 context.Context
	cancel              context.CancelFunc
	bigqueryJob         *bigquery.Job
	status              chan int32
	err                 string
	queryText           string
	totalRows           int64
	processedBytes      int64
	resultSize          int64
	resultID            *string
	storageObject       storage.StorageObject
	mutex               sync.Mutex
	logger              zerolog.Logger
	maxReadStreamsCount int32
	maxBytesBilled      int64
}

// Err of job
func (job *Job) Err() string {
	job.mutex.Lock()
	defer job.mutex.Unlock()
	return job.err
}

// GetResultSize of the job
func (job *Job) GetResultSize() int64 {
	job.mutex.Lock()
	defer job.mutex.Unlock()
	return job.resultSize
}

// GetResultID for the job; nil means results not yet saved
func (job *Job) GetResultID() *string {
	job.mutex.Lock()
	defer job.mutex.Unlock()
	return job.resultID
}

// GetTotalRows in result
func (job *Job) GetTotalRows() int64 {
	job.mutex.Lock()
	defer job.mutex.Unlock()
	return job.totalRows
}

func (job *Job) GetCtx() context.Context {
	return job.ctx
}

func (job *Job) GetID() string {
	return job.id
}

func (job *Job) GetQueryID() string {
	return job.queryID
}

func (job *Job) GetStatus() chan int32 {
	return job.status
}

func (job *Job) GetReportID() string {
	return job.reportID
}

// GetProcessedBytes in result
func (job *Job) GetProcessedBytes() int64 {
	job.mutex.Lock()
	defer job.mutex.Unlock()
	return job.processedBytes
}

var contextCancelledRe = regexp.MustCompile(`context canceled`)
var orderByRe = regexp.MustCompile(`(?ims)order[\s]+by`)

func (job *Job) close(storageWriter io.WriteCloser, csvWriter *csv.Writer) {
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
		job.logger.Err(err).Send()
		job.cancelWithError(err)
		return
	}
	resultSize, err := job.storageObject.GetSize(job.ctx)
	if err != nil {
		job.logger.Err(err).Send()
		job.cancelWithError(err)
		return
	}

	job.logger.Debug().Msg("Writing Done")
	job.mutex.Lock()
	job.resultSize = *resultSize
	job.resultID = &job.id
	job.mutex.Unlock()
	job.status <- int32(proto.Query_JOB_STATUS_DONE)
	job.cancel()
}

func (job *Job) setJobStats(queryStatus *bigquery.JobStatus, table *bigquery.Table) error {
	tableMetadata, err := table.Metadata(job.ctx)
	if err != nil {
		return err
	}
	job.mutex.Lock()
	defer job.mutex.Unlock()
	if queryStatus.Statistics != nil {
		job.processedBytes = queryStatus.Statistics.TotalBytesProcessed
	}
	job.totalRows = int64(tableMetadata.NumRows)
	return nil
}

// write csv rows to storage
func (job *Job) write(csvRows chan []string) {
	storageWriter := job.storageObject.GetWriter(job.ctx)
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
			job.logger.Err(err).Send()
			job.cancelWithError(err)
			break
		}
	}
	job.close(storageWriter, csvWriter)
}

func (job *Job) cancelWithError(err error) {
	job.mutex.Lock()
	job.err = err.Error()
	job.mutex.Unlock()
	job.status <- int32(proto.Query_JOB_STATUS_UNSPECIFIED)
	job.cancel()
}

type AvroSchema struct {
	Fields []struct {
		Name string `json:"name"`
	} `json:"fields"`
}

func (job *Job) proccessApiErrors(err error) {
	if apiError, ok := err.(*googleapi.Error); ok {
		for _, e := range apiError.Errors {
			if e.Reason == "bytesBilledLimitExceeded" {
				job.logger.Warn().Str(
					"DEKART_BIGQUERY_MAX_BYTES_BILLED", os.Getenv("DEKART_BIGQUERY_MAX_BYTES_BILLED"),
				).Msg(e.Message)
			}
		}
	}
}

func (job *Job) getResultTable() (*bigquery.Table, error) {
	jobConfig, err := job.bigqueryJob.Config()
	if err != nil {
		return nil, err
	}
	jobConfigVal := reflect.ValueOf(jobConfig).Elem()
	table, ok := jobConfigVal.FieldByName("Dst").Interface().(*bigquery.Table)
	if !ok {
		err := fmt.Errorf("cannot get destination table from job config")
		job.logger.Error().Err(err).Str("jobConfig", fmt.Sprintf("%v+", jobConfig)).Send()
		return nil, err
	}
	return table, nil
}

func (job *Job) wait() {
	queryStatus, err := job.bigqueryJob.Wait(job.ctx)
	if err == context.Canceled {
		return
	}
	if err != nil {
		job.proccessApiErrors(err)
		job.cancelWithError(err)
		return
	}
	if queryStatus == nil {
		job.logger.Fatal().Msgf("queryStatus == nil")
	}
	if err := queryStatus.Err(); err != nil {
		job.cancelWithError(err)
		return
	}

	table, err := job.getResultTable()
	if err != nil {
		job.cancelWithError(err)
		return
	}

	err = job.setJobStats(queryStatus, table)
	if err != nil {
		job.cancelWithError(err)
		return
	}

	job.status <- int32(proto.Query_JOB_STATUS_READING_RESULTS)

	csvRows := make(chan []string, job.totalRows)
	errors := make(chan error)

	// read table rows into csvRows
	go Read(
		job.ctx,
		errors,
		csvRows,
		table,
		job.logger,
		job.maxReadStreamsCount,
	)

	// write csvRows to storage
	go job.write(csvRows)

	// wait for errors
	err = <-errors
	if err != nil {
		job.cancelWithError(err)
		return
	}
	job.logger.Debug().Msg("Job Wait Done")
}

func (job *Job) setMaxReadStreamsCount(queryText string) {
	job.mutex.Lock()
	defer job.mutex.Unlock()
	if orderByRe.MatchString(queryText) {
		job.maxReadStreamsCount = 1 // keep order of items
	} else {
		job.maxReadStreamsCount = 10
	}
}

// Run implementation
func (job *Job) Run(storageObject storage.StorageObject) error {
	job.logger.Debug().Msg("Run BigQuery Job")
	client, err := bigquery.NewClient(job.ctx, os.Getenv("DEKART_BIGQUERY_PROJECT_ID"))
	if err != nil {
		job.cancel()
		return err
	}
	query := client.Query(job.queryText)
	query.MaxBytesBilled = job.maxBytesBilled

	job.setMaxReadStreamsCount(job.queryText)

	bigqueryJob, err := query.Run(job.ctx)
	if err != nil {
		job.cancel()
		return err
	}
	job.mutex.Lock()
	job.bigqueryJob = bigqueryJob
	job.storageObject = storageObject
	job.mutex.Unlock()
	job.status <- int32(proto.Query_JOB_STATUS_RUNNING)
	job.logger.Debug().Msg("Waiting for results")
	go job.wait()
	return nil
}
