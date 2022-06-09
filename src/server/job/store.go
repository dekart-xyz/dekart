package job

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/uuid"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/rs/zerolog/log"
)

// Store of jobs
type Store struct {
	jobs         []*Job
	outputBucket string
	region       string
	awsSession   *session.Session
	storage      copier
	mutex        sync.Mutex
}

// NewStore instance
func NewStore(storage copier) *Store {

	conf := aws.NewConfig().
		WithMaxRetries(3).
		WithS3ForcePathStyle(true)

	outputBucket := os.Getenv("DEKART_ATHENA_S3_RESULT")
	region := os.Getenv("AWS_REGION")
	awsSession := session.Must(session.NewSession(conf))
	store := &Store{
		outputBucket: outputBucket,
		region:       region,
		awsSession:   awsSession,
		storage:      storage,
	}
	store.jobs = make([]*Job, 0)
	return store
}

func (s *Store) removeJobWhenDone(job *Job) {
	<-job.Ctx.Done()
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
}

// NewJob job on store
func (s *Store) NewJob(reportID string, queryID string) (*Job, error) {
	maxBytesBilledStr := os.Getenv("DEKART_BIGQUERY_MAX_BYTES_BILLED")
	var maxBytesBilled int64
	var err error
	if maxBytesBilledStr != "" {
		maxBytesBilled, err = strconv.ParseInt(maxBytesBilledStr, 10, 64)
		if err != nil {
			log.Fatal().Msgf("Cannot parse DEKART_BIGQUERY_MAX_BYTES_BILLED")
			return nil, err
		}
	} else {
		log.Warn().Msgf("DEKART_BIGQUERY_MAX_BYTES_BILLED is not set! Use the maximum bytes billed setting to limit query costs. https://cloud.google.com/bigquery/docs/best-practices-costs#limit_query_costs_by_restricting_the_number_of_bytes_billed")
	}
	s.mutex.Lock()
	defer s.mutex.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	job := &Job{
		ID:             uuid.GetUUID(),
		ReportID:       reportID,
		QueryID:        queryID,
		Ctx:            ctx,
		cancel:         cancel,
		Status:         make(chan int32),
		logger:         log.With().Str("reportID", reportID).Str("queryID", queryID).Logger(),
		maxBytesBilled: maxBytesBilled,
		outputBucket:   s.outputBucket,
		region:         s.region,
		awsSession:     s.awsSession,
		cp:             s.storage,
	}

	s.jobs = append(s.jobs, job)
	go s.removeJobWhenDone(job)
	return job, nil
}

// Cancel job for queryID
func (s *Store) Cancel(queryID string) {
	s.mutex.Lock()
	for _, job := range s.jobs {
		if job.QueryID == queryID {
			job.Status <- int32(proto.Query_JOB_STATUS_UNSPECIFIED)
			job.logger.Info().Msg("Canceling Job Context")
			job.cancel()
		}
	}
	s.mutex.Unlock()
}
