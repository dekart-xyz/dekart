package athenajob

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/dekart"
	"dekart/src/server/storage"
	"dekart/src/server/uuid"
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/athena"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

// Store implements dekart.Store interface for athena
type Store struct {
	mutex          sync.Mutex
	session        *session.Session
	outputLocation string
	jobs           []*Job
}

func NewStore(storage storage.Storage) *Store {
	conf := aws.NewConfig().
		WithMaxRetries(3).
		WithS3ForcePathStyle(true)
	outputLocation := os.Getenv("DEKART_ATHENA_S3_OUTPUT_LOCATION")
	if outputLocation == "" {
		log.Fatal().Msgf("athena data source require DEKART_ATHENA_S3_OUTPUT_LOCATION")
	}

	session := session.Must(session.NewSession(conf))
	store := &Store{
		session:        session,
		outputLocation: fmt.Sprintf("s3://%s", outputLocation),
	}
	store.jobs = make([]*Job, 0)
	return store

}

func (s *Store) removeJobWhenDone(job *Job) {
	<-job.ctx.Done()
	s.mutex.Lock()
	for i, j := range s.jobs {
		if job.id == j.id {
			// removing job from slice
			last := len(s.jobs) - 1
			s.jobs[i] = s.jobs[last]
			s.jobs = s.jobs[:last]
			break
		}
	}
	s.mutex.Unlock()
}

// Create a new Athena job within the store
func (s *Store) Create(reportID string, queryID string, queryText string) (dekart.Job, chan int32, error) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	status := make(chan int32)
	client := athena.New(s.session)
	job := &Job{
		id:             uuid.GetUUID(),
		reportID:       reportID,
		queryID:        queryID,
		ctx:            ctx,
		cancel:         cancel,
		status:         status,
		logger:         log.With().Str("reportID", reportID).Str("queryID", queryID).Str("outputLocation", s.outputLocation).Logger(),
		queryText:      queryText,
		session:        s.session,
		client:         client,
		outputLocation: s.outputLocation,
	}
	s.jobs = append(s.jobs, job)
	go s.removeJobWhenDone(job)
	return job, status, nil
}

func (s *Store) Cancel(queryID string) {
	s.mutex.Lock()
	for _, job := range s.jobs {
		if job.queryID == queryID {
			job.status <- int32(proto.Query_JOB_STATUS_UNSPECIFIED)
			job.logger.Info().Msg("Canceling Job Context")
			job.cancel()
		}
	}
	s.mutex.Unlock()
}

func (s *Store) CancelAll(ctx context.Context) {
	s.mutex.Lock()
	for _, job := range s.jobs {
		select {
		case job.status <- int32(proto.Query_JOB_STATUS_UNSPECIFIED):
			job.logger.Info().Msg("Canceling Job Context")
		case <-ctx.Done():
			job.logger.Warn().Msg("Timeout canceling Job")
		}
		job.cancel()
	}
	s.mutex.Unlock()
}

// Job implements dekart.Job interface for Athena
type Job struct {
	id               string
	queryID          string
	reportID         string
	ctx              context.Context
	cancel           context.CancelFunc
	status           chan int32
	err              string
	queryText        string
	totalRows        int64
	processedBytes   int64
	resultSize       int64
	resultID         *string
	mutex            sync.Mutex
	logger           zerolog.Logger
	session          *session.Session
	queryExecutionId string
	client           *athena.Athena
	outputLocation   string
	storageObject    storage.StorageObject
}

func (j *Job) GetID() string {
	return j.id
}

func (j *Job) GetReportID() string {
	return j.reportID
}

func (j *Job) GetQueryID() string {
	return j.queryID
}

func (j *Job) GetResultID() *string {
	j.mutex.Lock()
	defer j.mutex.Unlock()
	return j.resultID
}

func (j *Job) GetTotalRows() int64 {
	j.mutex.Lock()
	defer j.mutex.Unlock()
	return j.totalRows
}

func (j *Job) GetProcessedBytes() int64 {
	j.mutex.Lock()
	defer j.mutex.Unlock()
	return j.processedBytes
}

func (j *Job) GetResultSize() int64 {
	j.mutex.Lock()
	defer j.mutex.Unlock()
	return j.resultSize
}

func (j *Job) GetCtx() context.Context {
	return j.ctx
}

func (j *Job) Err() string {
	j.mutex.Lock()
	defer j.mutex.Unlock()
	return j.err
}

func (job *Job) cancelWithError(err error) {
	if err != context.Canceled {
		job.mutex.Lock()
		job.err = err.Error()
		job.mutex.Unlock()
	}
	job.status <- int32(proto.Query_JOB_STATUS_UNSPECIFIED)
	job.cancel()
}

func (j *Job) pullQueryExecutionStatus() (*athena.QueryExecution, error) {
	var err error
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()
	input := &athena.GetQueryExecutionInput{
		QueryExecutionId: &j.queryExecutionId,
	}

	for {
		select {
		case <-j.ctx.Done():
			err = j.ctx.Err()
			return nil, err
		case <-ticker.C:
			out, err := j.client.GetQueryExecutionWithContext(j.ctx, input)
			if err != nil {
				j.cancelWithError(err)
				return nil, err
			}
			status := *out.QueryExecution.Status.State
			j.logger.Debug().Str("status", status).Send()
			switch status {
			case "RUNNING":
				continue
			case "SUCCEEDED":
				return out.QueryExecution, nil
			default:
				reason := "unknown reason"
				if out.QueryExecution.Status.StateChangeReason != nil {
					reason = *out.QueryExecution.Status.StateChangeReason
				}
				err = fmt.Errorf("query Failed. status: %s; Reason: %s", status, reason)
				return nil, err
			}
		}
	}

}
func (j *Job) wait() {
	queryExecution, err := j.pullQueryExecutionStatus()
	if err != nil {
		j.cancelWithError(err)
		return
	}
	j.logger.Debug().Msg("job done")
	{
		j.mutex.Lock()
		j.processedBytes = *queryExecution.Statistics.DataScannedInBytes
		j.mutex.Unlock()
	}
	j.status <- int32(proto.Query_JOB_STATUS_READING_RESULTS)
	err = j.storageObject.CopyFromS3(j.ctx, *queryExecution.ResultConfiguration.OutputLocation)
	if err != nil {
		j.cancelWithError(err)
		return
	}
	size, err := j.storageObject.GetSize(j.ctx)
	if err != nil {
		j.cancelWithError(err)
		return
	}
	{
		j.mutex.Lock()
		j.resultSize = *size
		j.resultID = &j.id
		j.mutex.Unlock()
	}
	j.status <- int32(proto.Query_JOB_STATUS_DONE)
	j.cancel()
}

func (j *Job) Run(storageObject storage.StorageObject) error {
	j.mutex.Lock()
	j.storageObject = storageObject
	j.mutex.Unlock()

	j.status <- int32(proto.Query_JOB_STATUS_PENDING)
	out, err := j.client.StartQueryExecutionWithContext(j.ctx, &athena.StartQueryExecutionInput{
		QueryString: &j.queryText,
		ResultConfiguration: &athena.ResultConfiguration{
			OutputLocation: &j.outputLocation,
		},
	})
	if err != nil {
		j.logger.Error().Err(err).Msg("Error starting query execution")
		j.cancelWithError(err)
		return nil
	}

	j.mutex.Lock()
	j.queryExecutionId = *out.QueryExecutionId
	j.mutex.Unlock()

	j.status <- int32(proto.Query_JOB_STATUS_RUNNING)

	j.logger.Debug().Str("queryExecutionId", j.queryExecutionId).Msg("waiting")
	go j.wait()
	return nil
}
