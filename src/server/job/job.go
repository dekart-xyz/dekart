package job

import (
	"dekart/src/proto"
	"encoding/csv"
	"io"
	"regexp"
	"sync"

	"context"

	"github.com/aws/aws-sdk-go/aws/session"
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

	cp copier
}

type copier interface {
	CopyObject(ctx context.Context, srcKeyFullPath, dstKey string) error
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

	// TODO: reading result as separate state
	job.Status <- int32(3)

	job.logger.Debug().Msgf("copy from: %s", *queryStatus.ResultConfiguration.OutputLocation)
	job.logger.Debug().Msgf("copying result to S3: %s", "s3://"+job.outputBucket+"/"+job.ID)

	err = job.cp.CopyObject(job.Ctx, *queryStatus.ResultConfiguration.OutputLocation, job.ID+".csv")
	if err != nil {
		job.cancelWithError(err)
		return
	}

	// csvRows := make(chan []string, job.totalRows)
	// csvRows := make(chan []string)
	// errors := make(chan error)

	// isSetupHeader := false
	// var totalRows int64
	// resultFunc := func(page *athena.GetQueryResultsOutput, lastPage bool) bool {
	// 	var csvHeader []string

	// 	for _, column := range page.ResultSet.ResultSetMetadata.ColumnInfo {
	// 		csvHeader = append(csvHeader, *column.Name)
	// 	}

	// 	if !isSetupHeader {
	// 		csvRows <- csvHeader
	// 		isSetupHeader = true
	// 	}

	// 	totalRows += int64(len(page.ResultSet.Rows))
	// 	job.logger.Debug().Int64("totalRows", totalRows).Send()
	// 	for n, row := range page.ResultSet.Rows {
	// 		if n != 0 {
	// 			// csvBody := make(map[string]string, len(csvHeader))
	// 			csvLine := make([]string, len(csvHeader))
	// 			for c, column := range row.Data {
	// 				if column.VarCharValue == nil {
	// 					// csvLine[c] = "<empty>"
	// 				} else {
	// 					// csvBody[csvHeader[c]] = *column.VarCharValue
	// 					csvLine[c] = *column.VarCharValue
	// 				}
	// 			}

	// 			// job.logger.Debug().Str("csvLine", fmt.Sprintf("%v+", csvLine)).Send()
	// 			csvRows <- csvLine
	// 		}
	// 	}
	// 	return !lastPage
	// }

	// go func() {
	// 	defer close(csvRows)
	// 	defer close(errors)
	// 	errors <- job.athenaQuery.handleSuccess(job.Ctx, resultFunc)
	// }()

	// // write csvRows to storage
	// go job.write(csvRows)

	// wait for errors
	// err = <-errors
	// if err != nil {
	// 	job.cancelWithError(err)
	// 	return
	// }

	job.logger.Debug().Msg("Writing Done")

	job.mutex.Lock()
	{
		job.resultID = &job.ID
		job.processedBytes = *queryStatus.Statistics.DataScannedInBytes
		// job.totalRows = totalRows
	}
	job.mutex.Unlock()

	job.Status <- int32(proto.Query_JOB_STATUS_DONE)
	job.cancel()

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
		// job.logger.Debug().Msg("Writing csv row")

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
