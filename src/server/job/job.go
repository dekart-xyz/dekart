package job

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/storage"
	"dekart/src/server/uuid"
	"sync"
	"time"

	"github.com/rs/zerolog"
)

// Store is the interface for the job storage
type Store interface {
	Create(reportID string, queryID string, queryText string) (Job, chan int32, error)
	Cancel(queryID string) bool
	CancelAll(ctx context.Context)
}

// Job is the interface for the query job in datasource like BigQuery or Athena
type Job interface {
	GetID() string
	GetReportID() string
	GetQueryID() string
	GetResultID() *string // uuid; nil means no result yet
	GetTotalRows() int64
	GetProcessedBytes() int64
	GetResultSize() int64
	GetCtx() context.Context
	Err() string
	Run(storageObject storage.StorageObject) error
	Status() chan int32
	Cancel()
}

// BasicJob implements the common methods for Job
type BasicJob struct {
	sync.Mutex
	id             string
	ctx            context.Context
	cancel         context.CancelFunc
	status         chan int32
	err            string
	QueryID        string
	ReportID       string
	QueryText      string
	TotalRows      int64
	ResultID       *string
	ProcessedBytes int64
	ResultSize     int64
	Logger         zerolog.Logger
}

func (j *BasicJob) Init() {
	j.id = uuid.GetUUID()
	j.ctx, j.cancel = context.WithTimeout(context.Background(), 10*time.Minute)
	j.status = make(chan int32)
}

func (j *BasicJob) GetProcessedBytes() int64 {
	j.Lock()
	defer j.Unlock()
	return j.ProcessedBytes
}

func (j *BasicJob) GetResultSize() int64 {
	j.Lock()
	defer j.Unlock()
	return j.ResultSize
}

func (j *BasicJob) GetResultID() *string {
	j.Lock()
	defer j.Unlock()
	return j.ResultID
}

func (j *BasicJob) Cancel() {
	j.cancel()
}

func (j *BasicJob) Status() chan int32 {
	return j.status
}

func (j *BasicJob) GetID() string {
	return j.id
}

func (j *BasicJob) GetReportID() string {
	return j.ReportID
}

func (j *BasicJob) GetQueryID() string {
	return j.QueryID
}

func (j *BasicJob) GetQueryText() string {
	return j.QueryText
}

func (j *BasicJob) GetTotalRows() int64 {
	j.Lock()
	defer j.Unlock()
	return j.TotalRows
}

func (j *BasicJob) GetCtx() context.Context {
	return j.ctx
}

func (j *BasicJob) Err() string {
	j.Lock()
	defer j.Unlock()
	return j.err
}

func (j *BasicJob) CancelWithError(err error) {
	if err != context.Canceled {
		j.Lock()
		j.err = err.Error()
		j.Unlock()
	}
	j.status <- int32(proto.Query_JOB_STATUS_UNSPECIFIED)
	j.cancel()
}

// BasicStore implements common methods for Store
type BasicStore struct {
	sync.Mutex
	Jobs []Job
}

//RemoveJobWhenDone blocks until the job is finished
func (s *BasicStore) RemoveJobWhenDone(job Job) {
	<-job.GetCtx().Done()
	s.Lock()
	for i, j := range s.Jobs {
		if job.GetID() == j.GetID() {
			// removing job from slice
			last := len(s.Jobs) - 1
			s.Jobs[i] = s.Jobs[last]
			s.Jobs = s.Jobs[:last]
			break
		}
	}
	s.Unlock()
}

func (s *BasicStore) Cancel(queryID string) bool {
	s.Lock()
	defer s.Unlock()
	for _, job := range s.Jobs {
		if job.GetQueryID() == queryID {
			job.Cancel()
			return true
		}
	}
	return false
}

func (s *BasicStore) CancelAll(ctx context.Context) {
	s.Lock()
	for _, job := range s.Jobs {
		select {
		case job.Status() <- int32(proto.Query_JOB_STATUS_UNSPECIFIED):
		case <-ctx.Done():
		}
		job.Cancel()
	}
	s.Unlock()
}
