package job

import (
	"dekart/src/proto"
	"dekart/src/server/uuid"
	"encoding/csv"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"sync"
	"time"

	"context"

	"cloud.google.com/go/bigquery"
	"cloud.google.com/go/storage"
	"github.com/rs/zerolog/log"
	"google.golang.org/api/googleapi"
	"google.golang.org/api/iterator"
)

// Job of quering db, concurency safe
type Job struct {
	ID             string
	QueryID        string
	ReportID       string
	Ctx            context.Context
	cancel         context.CancelFunc
	bigqueryJob    *bigquery.Job
	Status         chan int32
	err            string
	totalRows      int64
	processedBytes int64
	resultSize     int64
	resultID       *string
	storageObj     *storage.ObjectHandle
	mutex          sync.Mutex
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

func (job *Job) close(storageWriter *storage.Writer, csvWriter *csv.Writer) {
	csvWriter.Flush()
	err := storageWriter.Close()
	if err != nil {
		if err == context.Canceled {
			return
		}
		if contextCancelledRe.MatchString(err.Error()) {
			return
		}
		log.Err(err).Send()
		job.cancelWithError(err)
		return
	}
	attrs := storageWriter.Attrs()
	job.mutex.Lock()
	// TODO: use bool done
	job.resultID = &job.ID
	if attrs != nil {
		job.resultSize = attrs.Size
	}
	job.mutex.Unlock()
	job.Status <- int32(proto.Query_JOB_STATUS_DONE)
	job.cancel()
}

func (job *Job) setJobStats(queryStatus *bigquery.JobStatus, totalRows uint64) {
	job.mutex.Lock()
	defer job.mutex.Unlock()
	if queryStatus.Statistics != nil {
		job.processedBytes = queryStatus.Statistics.TotalBytesProcessed
	}
	job.totalRows = int64(totalRows)
}

// write csv rows to storage
func (job *Job) write(csvRows chan []string) {
	storageWriter := job.storageObj.NewWriter(job.Ctx)
	storageWriter.ChunkSize = 0 // do not buffer when writing to storage
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
			log.Err(err).Send()
			job.cancelWithError(err)
			break
		}
	}
	job.close(storageWriter, csvWriter)
}

// read rows from bigquery response and send to csvRows channel
func (job *Job) read(it *bigquery.RowIterator, csvRows chan []string) {
	firstLine := true
	for {
		var row []bigquery.Value
		err := it.Next(&row)
		if err == iterator.Done {
			break
		}
		if err == context.Canceled {
			break
		}
		if err != nil {
			log.Err(err).Send()
			job.cancelWithError(err)
			return
		}
		if firstLine {
			firstLine = false
			csvRow := make([]string, len(row), len(row))
			for i, fieldSchema := range it.Schema {
				csvRow[i] = fieldSchema.Name
				// fmt.Println(fieldSchema.Name, fieldSchema.Type)
			}
			csvRows <- csvRow
		}
		csvRow := make([]string, len(row), len(row))
		for i, v := range row {
			csvRow[i] = fmt.Sprintf("%v", v)
		}
		csvRows <- csvRow
	}
	close(csvRows)
}

func (job *Job) cancelWithError(err error) {
	job.mutex.Lock()
	job.err = err.Error()
	job.mutex.Unlock()
	job.Status <- 0
	job.cancel()
}

func (job *Job) wait() {
	queryStatus, err := job.bigqueryJob.Wait(job.Ctx)
	if err == context.Canceled {
		return
	}
	if err != nil {
		if apiError, ok := err.(*googleapi.Error); ok {
			for _, e := range apiError.Errors {
				if e.Reason == "bytesBilledLimitExceeded" {
					log.Warn().Str(
						"DEKART_BIGQUERY_MAX_BYTES_BILLED", os.Getenv("DEKART_BIGQUERY_MAX_BYTES_BILLED"),
					).Msg(e.Message)
				}
			}
		}
		job.cancelWithError(err)
		return
	}
	if queryStatus == nil {
		log.Fatal().Msgf("queryStatus == nil")
	}
	if err := queryStatus.Err(); err != nil {
		job.cancelWithError(err)
		return
	}

	it, err := job.bigqueryJob.Read(job.Ctx)
	if err != nil {
		log.Err(err).Send()
		job.cancelWithError(err)
		return
	}
	// it.PageInfo().MaxSize = 50000
	job.setJobStats(queryStatus, it.TotalRows)
	job.Status <- int32(queryStatus.State)

	csvRows := make(chan []string, it.TotalRows)

	go job.read(it, csvRows)
	go job.write(csvRows)
}

// Run implementation
func (job *Job) Run(queryText string, obj *storage.ObjectHandle) error {
	client, err := bigquery.NewClient(job.Ctx, os.Getenv("DEKART_BIGQUERY_PROJECT_ID"))
	if err != nil {
		job.cancel()
		return err
	}
	query := client.Query(queryText)
	maxBytesBilled := os.Getenv("DEKART_BIGQUERY_MAX_BYTES_BILLED")
	if maxBytesBilled != "" {
		query.MaxBytesBilled, err = strconv.ParseInt(maxBytesBilled, 10, 64)
		if err != nil {
			job.cancel()
			log.Fatal().Msgf("Cannot parse DEKART_BIGQUERY_MAX_BYTES_BILLED")
		}
	} else {
		log.Warn().Msgf("DEKART_BIGQUERY_MAX_BYTES_BILLED is not set! Use the maximum bytes billed setting to limit query costs. https://cloud.google.com/bigquery/docs/best-practices-costs#limit_query_costs_by_restricting_the_number_of_bytes_billed")
	}

	bigqueryJob, err := query.Run(job.Ctx)
	if err != nil {
		job.cancel()
		return err
	}

	job.mutex.Lock()
	job.bigqueryJob = bigqueryJob
	job.storageObj = obj
	job.mutex.Unlock()
	job.Status <- int32(proto.Query_JOB_STATUS_RUNNING)
	go job.wait()
	return nil
}

// Store of jobs
type Store struct {
	jobs  []*Job
	mutex sync.Mutex
}

// NewStore instance
func NewStore() *Store {
	store := &Store{}
	store.jobs = make([]*Job, 0)
	return store
}

func (s *Store) removeJobWhenDone(job *Job) {
	select {
	case <-job.Ctx.Done():
		s.mutex.Lock()
		for i, j := range s.jobs {
			if job.ID == j.ID {
				// removing job from slice
				last := len(s.jobs) - 1
				s.jobs[i] = s.jobs[last]
				s.jobs = s.jobs[:last]
				break
			}
		}
		s.mutex.Unlock()
		return
	}
}

// New job on store
func (s *Store) New(reportID string, queryID string) *Job {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	job := &Job{
		ID:       uuid.GetUUID(),
		ReportID: reportID,
		QueryID:  queryID,
		Ctx:      ctx,
		cancel:   cancel,
		Status:   make(chan int32),
	}
	s.jobs = append(s.jobs, job)
	go s.removeJobWhenDone(job)
	return job
}

// Cancel job for queryID
func (s *Store) Cancel(queryID string) {
	s.mutex.Lock()
	for _, job := range s.jobs {
		if job.QueryID == queryID {
			job.Status <- int32(proto.Query_JOB_STATUS_UNSPECIFIED)
			log.Info().Msg("Canceling Job Context")
			job.cancel()
		}
	}
	s.mutex.Unlock()
}
