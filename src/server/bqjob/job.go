package bqjob

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"reflect"
	"regexp"

	"dekart/src/proto"
	"dekart/src/server/job"
	"dekart/src/server/storage"

	"cloud.google.com/go/bigquery"
	"google.golang.org/api/googleapi"
)

// Job implements the dekart.Job interface for BigQuery; concurrency safe.
type Job struct {
	job.BasicJob
	bigqueryJob         *bigquery.Job
	storageObject       storage.StorageObject
	maxReadStreamsCount int32
	maxBytesBilled      int64
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
		job.Logger.Err(err).Send()
		job.CancelWithError(err)
		return
	}
	resultSize, err := job.storageObject.GetSize(job.GetCtx())
	if err != nil {
		job.Logger.Err(err).Send()
		job.CancelWithError(err)
		return
	}

	job.Logger.Debug().Msg("Writing Done")
	job.Lock()
	job.ResultSize = *resultSize
	jobID := job.GetID()
	job.ResultID = &jobID
	job.Unlock()
	job.Status() <- int32(proto.Query_JOB_STATUS_DONE)
	job.Cancel()
}

func (job *Job) setJobStats(queryStatus *bigquery.JobStatus, table *bigquery.Table) error {
	if table == nil {
		return fmt.Errorf("table is nil")
	}

	tableMetadata, err := table.Metadata(job.GetCtx())
	if err != nil {
		return err
	}
	job.Lock()
	defer job.Unlock()
	if queryStatus.Statistics != nil {
		job.ProcessedBytes = queryStatus.Statistics.TotalBytesProcessed
	}
	job.TotalRows = int64(tableMetadata.NumRows)
	return nil
}

// write csv rows to storage
func (job *Job) write(csvRows chan []string) {
	storageWriter := job.storageObject.GetWriter(job.GetCtx())
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
			job.Logger.Err(err).Send()
			job.CancelWithError(err)
			break
		}
	}
	job.close(storageWriter, csvWriter)
}

type AvroSchema struct {
	Fields []struct {
		Name string `json:"name"`
	} `json:"fields"`
}

func (job *Job) processApiErrors(err error) {
	if apiError, ok := err.(*googleapi.Error); ok {
		for _, e := range apiError.Errors {
			if e.Reason == "bytesBilledLimitExceeded" {
				job.Logger.Warn().Str(
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
		job.Logger.Error().Err(err).Str("jobConfig", fmt.Sprintf("%v+", jobConfig)).Send()
		return nil, err
	}
	if table == nil {
		err := fmt.Errorf("destination table is nil")
		job.Logger.Error().Err(err).Str("jobConfig", fmt.Sprintf("%v+", jobConfig)).Send()
		return nil, err
	}

	return table, nil
}

func (job *Job) GetResultTableForScript() (*bigquery.Table, error){

	client, err := bigquery.NewClient(job.GetCtx(), os.Getenv("DEKART_BIGQUERY_PROJECT_ID"))


	jobFromJobId, err := client.JobFromID(job.GetCtx(), job.bigqueryJob.ID())
	if err != nil{
		return nil, err
	}

	cfg, err := jobFromJobId.Config()

	if err != nil{
		return nil, err
	}

	queryConfig, ok := cfg.(*bigquery.QueryConfig)
	if !ok{
		err := fmt.Errorf("was expecting QueryConfig type for configuration")
		job.Logger.Error().Err(err).Str("jobConfig", fmt.Sprintf("%v+", cfg)).Send()
		return nil, err
	}

	table := queryConfig.Dst

	if table == nil {
		err := fmt.Errorf("destination table is nil even when gathered from JobId")
		job.Logger.Error().Err(err).Str("jobConfig", fmt.Sprintf("%v+", cfg)).Send()
		return nil, err
	}

	return table, nil

}


func (job *Job) wait() {
	queryStatus, err := job.bigqueryJob.Wait(job.GetCtx())
	if err == context.Canceled {
		return
	}
	if err != nil {
		job.processApiErrors(err)
		job.CancelWithError(err)
		return
	}
	if queryStatus == nil {
		job.Logger.Fatal().Msgf("queryStatus == nil")
	}
	if err := queryStatus.Err(); err != nil {
		job.CancelWithError(err)
		return
	}

	table, err := job.getResultTable()
	if err != nil {
		table, err = job.GetResultTableForScript()
		if err != nil{
			job.CancelWithError(err)
			return
		}
	}

	err = job.setJobStats(queryStatus, table)
	if err != nil {
		job.CancelWithError(err)
		return
	}

	job.Status() <- int32(proto.Query_JOB_STATUS_READING_RESULTS)

	csvRows := make(chan []string, job.TotalRows)
	errors := make(chan error)

	// read table rows into csvRows
	go Read(
		job.GetCtx(),
		errors,
		csvRows,
		table,
		job.Logger,
		job.maxReadStreamsCount,
	)

	// write csvRows to storage
	go job.write(csvRows)

	// wait for errors
	err = <-errors
	if err != nil {
		job.CancelWithError(err)
		return
	}
	job.Logger.Debug().Msg("Job Wait Done")
}

func (job *Job) setMaxReadStreamsCount(queryText string) {
	job.Lock()
	defer job.Unlock()
	if orderByRe.MatchString(queryText) {
		job.maxReadStreamsCount = 1 // keep order of items
	} else {
		job.maxReadStreamsCount = 10
	}
}

// Run implementation
func (job *Job) Run(storageObject storage.StorageObject) error {
	job.Logger.Debug().Msg("Run BigQuery Job")
	client, err := bigquery.NewClient(job.GetCtx(), os.Getenv("DEKART_BIGQUERY_PROJECT_ID"))
	if err != nil {
		job.Cancel()
		return err
	}
	query := client.Query(job.QueryText)
	query.MaxBytesBilled = job.maxBytesBilled

	job.setMaxReadStreamsCount(job.QueryText)

	bigqueryJob, err := query.Run(job.GetCtx())
	if err != nil {
		job.Cancel()
		return err
	}
	job.Lock()
	job.bigqueryJob = bigqueryJob
	job.storageObject = storageObject
	job.Unlock()
	job.Status() <- int32(proto.Query_JOB_STATUS_RUNNING)
	job.Logger.Debug().Msg("Waiting for results")
	go job.wait()
	return nil
}
