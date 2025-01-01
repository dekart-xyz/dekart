package bqjob

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"regexp"
	"strings"

	"dekart/src/proto"
	"dekart/src/server/bqstorage"
	"dekart/src/server/bqutils"
	"dekart/src/server/errtype"
	"dekart/src/server/job"
	"dekart/src/server/storage"
	"dekart/src/server/user"

	"cloud.google.com/go/bigquery"
	"google.golang.org/api/googleapi"
	"google.golang.org/api/option"
)

// Job implements the dekart.Job interface for BigQuery; concurrency safe.
type Job struct {
	job.BasicJob
	bigqueryJob         *bigquery.Job
	storageObject       storage.StorageObject
	maxReadStreamsCount int32
	maxBytesBilled      int64
	client              *bigquery.Client
}

var orderByRe = regexp.MustCompile(`(?ims)order[\s]+by`)

func (job *Job) close(storageWriter io.WriteCloser, csvWriter *csv.Writer) {
	csvWriter.Flush()
	err := storageWriter.Close()
	if err != nil {
		// maybe we should not close when context is canceled in job.write()
		if err == context.Canceled {
			return
		}
		if errtype.ContextCancelledRe.MatchString(err.Error()) {
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
	job.ResultReady = true
	job.Unlock()
	job.Status() <- int32(proto.QueryJob_JOB_STATUS_DONE)
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
	table, err := bqutils.GetTableFromJob(job.bigqueryJob)
	if err != nil {
		return nil, err
	}
	if table == nil {
		jobFromJobId, err := job.client.JobFromID(job.GetCtx(), job.bigqueryJob.ID())
		if err != nil {
			return nil, err
		}
		table, err = bqutils.GetTableFromJob(jobFromJobId)
		if err != nil {
			return nil, err
		}
	}
	if table == nil {
		return nil, fmt.Errorf("result table is nil")
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

	_, isBigQueryStorage := job.storageObject.(bqstorage.BigQueryStorageObject)
	if isBigQueryStorage {
		// result will stay in BigQuery temp result table and will be read from there
		job.Lock()
		bqJobID := job.bigqueryJob.ID()
		job.DWJobID = &bqJobID // identify result storage
		job.ResultReady = true
		job.Unlock()
		job.Status() <- int32(proto.QueryJob_JOB_STATUS_DONE)
		job.Cancel()
		return
	}

	table, err := job.getResultTable()
	if err != nil {
		job.CancelWithError(err)
		return
	}

	err = job.setJobStats(queryStatus, table)
	if err != nil {
		job.CancelWithError(err)
		return
	}

	job.Status() <- int32(proto.QueryJob_JOB_STATUS_READING_RESULTS)

	csvRows := make(chan []string, job.TotalRows)
	errors := make(chan error)

	// read table rows into csvRows
	go bqutils.Read(
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

func getOauthScopes() []string {
	scopes := []string{"https://www.googleapis.com/auth/bigquery"}
	extraScopesRaw := os.Getenv("DEKART_GCP_EXTRA_OAUTH_SCOPES")
	if extraScopesRaw != "" {
		extraScopes := strings.Split(extraScopesRaw, ",")
		scopes = append(scopes, extraScopes...)
	}
	return scopes

}

// Run implementation
func (job *Job) Run(storageObject storage.StorageObject, conn *proto.Connection) error {
	job.Logger.Debug().Msg("Run BigQuery Job")
	var client *bigquery.Client = nil
	var err error
	tokenSource := user.GetTokenSource(job.GetCtx())
	if tokenSource != nil {
		job.Logger.Debug().Msg("Using oauth2 token")
		client, err = bigquery.NewClient(
			job.GetCtx(),
			conn.BigqueryProjectId,
			option.WithTokenSource(tokenSource),
		)
	} else {
		client, err = bigquery.NewClient(
			job.GetCtx(),
			conn.BigqueryProjectId,
			option.WithScopes(getOauthScopes()...),
		)
	}
	if err != nil {
		job.Cancel()
		return err
	}

	job.client = client

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
	job.Status() <- int32(proto.QueryJob_JOB_STATUS_RUNNING)
	job.Logger.Debug().Msg("Waiting for results")
	go job.wait()
	return nil
}
