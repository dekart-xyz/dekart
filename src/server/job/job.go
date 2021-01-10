package job

import (
	"dekart/src/proto"
	"dekart/src/server/uuid"
	"encoding/csv"
	"fmt"
	"os"
	"sync"
	"time"

	"context"

	"cloud.google.com/go/bigquery"
	"cloud.google.com/go/storage"
	"github.com/rs/zerolog/log"
	"google.golang.org/api/iterator"
)

// Job of quering db, concurency safe
type Job struct {
	ID          string
	QueryID     string
	ReportID    string
	Ctx         context.Context
	cancel      context.CancelFunc
	bigqueryJob *bigquery.Job
	Status      chan int32
	err         string
	resultID    *string
	storageObj  *storage.ObjectHandle
	mutex       sync.Mutex
}

// Err of job
func (job *Job) Err() string {
	job.mutex.Lock()
	defer job.mutex.Unlock()
	return job.err
}

// GetResultID for the job; nil means results not yet saved
func (job *Job) GetResultID() *string {
	job.mutex.Lock()
	defer job.mutex.Unlock()
	return job.resultID
}

func (job *Job) close(storageWriter *storage.Writer, csvWriter *csv.Writer) {
	csvWriter.Flush()
	err := storageWriter.Close()
	if err == context.Canceled {
		return
	}
	if err != nil {
		log.Err(err).Msg("Error when closing bucket connection")
		job.cancel()
		return
	}
	job.mutex.Lock()
	// TODO: use bool done
	job.resultID = &job.ID
	job.mutex.Unlock()
	job.Status <- int32(proto.Query_JOB_STATUS_DONE)
	job.cancel()
}

func (job *Job) read() {
	ctx := job.Ctx
	storageWriter := job.storageObj.NewWriter(ctx)
	csvWriter := csv.NewWriter(storageWriter)
	defer job.close(storageWriter, csvWriter)
	it, err := job.bigqueryJob.Read(ctx)
	if err != nil {
		log.Err(err).Send()
		job.cancel()
		return
	}
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
			job.cancel()
			return
		}
		if firstLine {
			firstLine = false
			csvRow := make([]string, len(row), len(row))
			for i, fieldSchema := range it.Schema {
				csvRow[i] = fieldSchema.Name
				// fmt.Println(fieldSchema.Name, fieldSchema.Type)
			}
			err = csvWriter.Write(csvRow)
			if err == context.Canceled {
				break
			}
			if err != nil {
				log.Err(err).Send()
				job.cancel()
				return
			}
		}
		csvRow := make([]string, len(row), len(row))
		for i, v := range row {
			csvRow[i] = fmt.Sprintf("%v", v)
		}
		err = csvWriter.Write(csvRow)
		if err == context.Canceled {
			break
		}
		if err != nil {
			log.Err(err).Send()
			job.cancel()
			return
		}
	}
}

func (job *Job) wait() {
	queryStatus, err := job.bigqueryJob.Wait(job.Ctx)
	if err == context.Canceled {
		return
	}
	if err != nil {
		job.mutex.Lock()
		job.err = err.Error()
		job.mutex.Unlock()
		job.Status <- 0
		job.cancel()
		return
	}
	if queryStatus != nil {
		job.Status <- int32(queryStatus.State)
	}
	job.read()
}

// Run implementation
func (job *Job) Run(queryText string, obj *storage.ObjectHandle) error {
	client, err := bigquery.NewClient(job.Ctx, os.Getenv("DEKART_BIGQUERY_PROJECT_ID"))
	if err != nil {
		job.cancel()
		return err
	}
	bigqueryJob, err := client.Query(queryText).Run(job.Ctx)
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
