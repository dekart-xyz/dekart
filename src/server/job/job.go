package job

import (
	"dekart/src/proto"
	"encoding/csv"
	"fmt"
	"io"
	"regexp"
	"sync"

	"context"

	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/athena"
	"github.com/rs/zerolog"
)

// Job of quering db, concurency safe
type Job struct {
	ID                  string
	QueryID             string
	ReportID            string
	Ctx                 context.Context
	cancel              context.CancelFunc
	athenaQuery         *AthenaQuery
	Status              chan int32
	err                 string
	totalRows           int64
	processedBytes      int64
	resultSize          int64
	resultID            *string
	storageWriter       io.WriteCloser
	mutex               sync.Mutex
	logger              zerolog.Logger
	maxReadStreamsCount int32
	maxBytesBilled      int64
	outputBucket        string
	region              string
	awsSession          *session.Session
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

// GetProcessedBytes in result
func (job *Job) GetProcessedBytes() int64 {
	job.mutex.Lock()
	defer job.mutex.Unlock()
	return job.processedBytes
}

var contextCancelledRe = regexp.MustCompile(`context canceled`)

// var orderByRe = regexp.MustCompile(`(?ims)order[\s]+by`)

func (job *Job) close(storageWriter io.WriteCloser, csvWriter *csv.Writer) {
	csvWriter.Flush()

	err := storageWriter.Close()
	if err != nil {
		job.logger.Debug().Err(err).Msg("if err != nil")
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
	job.logger.Debug().Msg("Writing Done")
	job.mutex.Lock()
	// TODO: use bool done or better new status values
	job.resultID = &job.ID
	job.mutex.Unlock()
	job.Status <- int32(proto.Query_JOB_STATUS_DONE)
	job.cancel()
}

func (job *Job) cancelWithError(err error) {
	job.mutex.Lock()
	job.err = err.Error()
	job.mutex.Unlock()
	job.Status <- 0
	job.cancel()
}

func (job *Job) wait() {
	queryStatus, err := job.athenaQuery.pollQueryState(job.Ctx)
	if err == context.Canceled {
		return
	}

	if err != nil {
		job.cancelWithError(err)
		return
	}
	if queryStatus == nil {
		job.logger.Fatal().Msgf("queryStatus == nil")
	}

	if err := job.athenaQuery.handleFailure(); err != nil {
		job.cancelWithError(err)
		return
	}

	if err := job.athenaQuery.handleSuccess(); err != nil {
		job.cancelWithError(err)
		return
	}

	job.mutex.Lock()
	{
		job.processedBytes = *queryStatus.Statistics.DataScannedInBytes
		job.totalRows = int64(len(job.athenaQuery.results.ResultSet.Rows))
	}
	job.mutex.Unlock()

	// TODO: reading result as separate state
	job.Status <- int32(2)

	// csvRows := make(chan []string, job.totalRows)
	csvRows := make(chan []string)
	errors := make(chan error)

	resultFunc := func(page *athena.GetQueryResultsOutput, lastPage bool) bool {
		defer close(csvRows)
		defer close(errors)

		// fmt.Println(len(page.ResultSet.Rows), "Rows")
		// resultMap := make(map[string][]map[string]string)
		var csvHeader []string

		for _, column := range page.ResultSet.ResultSetMetadata.ColumnInfo {
			// fmt.Println(c, column)
			csvHeader = append(csvHeader, *column.Name)
		}
		// fmt.Println("Header", len(csvHeader), csvHeader)
		csvRows <- csvHeader

		job.logger.Debug().Msg(fmt.Sprintf("all result set rows: %d", len(page.ResultSet.Rows)))
		for n, row := range page.ResultSet.Rows {
			if n != 0 {
				// csvBody := make(map[string]string, len(csvHeader))
				csvLine := make([]string, len(csvHeader))
				for c, column := range row.Data {
					if column.VarCharValue == nil {
						// csvLine[c] = "<empty>"
					} else {
						// csvBody[csvHeader[c]] = *column.VarCharValue
						csvLine[c] = *column.VarCharValue
					}
				}

				job.logger.Debug().Str("csvLine", fmt.Sprintf("%v+", csvLine)).Send()
				csvRows <- csvLine
				// resultMap["result"] = append(resultMap["result"], csvBody)
			}
		}

		// jsonString, _ := json.Marshal(resultMap)
		// fmt.Println(string(jsonString))
		return !lastPage
	}

	go resultFunc(job.athenaQuery.results, true)

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

func (job *Job) write(csvRows chan []string) {
	csvWriter := csv.NewWriter(job.storageWriter)
	for {
		csvRow, more := <-csvRows
		if !more {
			job.logger.Debug().Msg("no more csv rows")
			break
		}
		job.logger.Debug().Msg("Writing csv row")

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
	job.close(job.storageWriter, csvWriter)
}

func (job *Job) Run(queryText string, storageWriter io.WriteCloser) error {
	var err error
	var q AthenaQuery
	q.inputParams = &InputParams{
		AwsSession:   job.awsSession,
		QueryString:  &queryText,
		Region:       &job.region,
		OutputBucket: &job.outputBucket,
	}

	// create query
	q.createQuery()

	// create client
	err = q.createClient()
	if err != nil {
		return err
	}

	job.mutex.Lock()
	job.storageWriter = storageWriter
	job.mutex.Unlock()
	job.Status <- int32(proto.Query_JOB_STATUS_RUNNING)
	job.logger.Debug().Msg("Waiting for results")

	// start query
	err = q.startQuery()
	if err != nil {
		job.cancelWithError(err)
		return nil
	}

	job.athenaQuery = &q

	go job.wait()

	return nil
}
