package job

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/conn"
	"dekart/src/server/errtype"
	"dekart/src/server/storage"
	"dekart/src/server/user"
	"dekart/src/server/uuid"
	"sync"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

// Store is the interface for the job storage
type Store interface {
	Create(reportID string, queryID string, queryText string, userCtx context.Context) (Job, chan int32, error)
	TestConnection(ctx context.Context, req *proto.TestConnectionRequest) (*proto.TestConnectionResponse, error)
	Cancel(queryID string) bool
	CancelAll(ctx context.Context)
}

// Job is the interface for the query job in datasource like BigQuery or Athena
type Job interface {
	GetID() string
	GetReportID() string
	GetQueryID() string
	GetResultID() *string  // same as GetID(); nil means no result yet
	IsResultReady() bool   // true if result is ready
	GetDWJobID() *string   // DW job ID, nil if not applicable or not yet known
	GetResultURI() *string // URI of the result, nil if not applicable or not yet known
	GetTotalRows() int64
	GetProcessedBytes() int64
	GetResultSize() int64
	GetCtx() context.Context
	Err() string
	Run(storageObject storage.StorageObject, connection *proto.Connection) error
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
	ResultReady    bool
	DWJobID        *string
	ResultURI      *string // URI of the result, nil if not applicable or not yet known
	ProcessedBytes int64
	ResultSize     int64
	Logger         zerolog.Logger
}

func (j *BasicJob) Init(userCtx context.Context) {
	j.id = uuid.GetUUID()
	j.ctx, j.cancel = context.WithTimeout(
		conn.CopyConnectionCtx(
			userCtx,
			user.CopyUserContext(userCtx, context.Background()),
		),
		10*time.Minute,
	)
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

func (j *BasicJob) IsResultReady() bool {
	j.Lock()
	defer j.Unlock()
	return j.ResultReady
}

func (j *BasicJob) GetResultID() *string {
	j.Lock()
	defer j.Unlock()
	if j.ResultReady {
		id := j.GetID()
		return &id
	}
	return nil
}

func (j *BasicJob) GetResultURI() *string {
	j.Lock()
	defer j.Unlock()
	return j.ResultURI
}

func (j *BasicJob) GetDWJobID() *string {
	j.Lock()
	defer j.Unlock()
	return j.DWJobID
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
	if err != context.Canceled && !errtype.ContextCancelledRe.MatchString(err.Error()) {
		j.Lock()
		j.err = err.Error()
		j.Unlock()
	}
	j.status <- int32(proto.QueryJob_JOB_STATUS_UNSPECIFIED)
	j.cancel()
}

// BasicStore implements common methods for Store
type BasicStore struct {
	sync.Mutex
	Jobs []Job
}

func (s *BasicStore) TestConnection(ctx context.Context, req *proto.TestConnectionRequest) (*proto.TestConnectionResponse, error) {
	log.Fatal().Msg("not implemented")
	return nil, nil
}

func (s *BasicStore) StoreJob(job Job) {
	s.Lock()
	s.Jobs = append(s.Jobs, job)
	s.Unlock()
}

// RemoveJobWhenDone blocks until the job is finished
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

func (s *BasicStore) Cancel(jobID string) bool {
	s.Lock()
	defer s.Unlock()
	for _, job := range s.Jobs {
		if job.GetID() == jobID {
			job.Status() <- int32(proto.QueryJob_JOB_STATUS_UNSPECIFIED)
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
		case job.Status() <- int32(proto.QueryJob_JOB_STATUS_UNSPECIFIED):
		case <-ctx.Done():
		}
		job.Cancel()
	}
	s.Unlock()
}
