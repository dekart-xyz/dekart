package athenajob

import (
	"dekart/src/proto"
	"dekart/src/server/job"
	"dekart/src/server/storage"
	"fmt"
	"os"
	"time"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/athena"
	"github.com/rs/zerolog/log"
)

// Store implements job.Store interface for athena
type Store struct {
	job.BasicStore
	session        *session.Session
	outputLocation string
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
	return store

}

// Create a new Athena job within the store
func (s *Store) Create(reportID string, queryID string, queryText string) (job.Job, chan int32, error) {
	client := athena.New(s.session)
	job := &Job{
		BasicJob: job.BasicJob{
			ReportID:  reportID,
			QueryID:   queryID,
			QueryText: queryText,
			Logger:    log.With().Str("reportID", reportID).Str("queryID", queryID).Logger(),
		},
		session:        s.session,
		client:         client,
		outputLocation: s.outputLocation,
	}
	job.Init()
	s.StoreJob(job)
	go s.RemoveJobWhenDone(job)
	return job, job.Status(), nil
}

// Job implements dekart.Job interface for Athena
type Job struct {
	job.BasicJob
	session          *session.Session
	queryExecutionId string
	client           *athena.Athena
	outputLocation   string
	storageObject    storage.StorageObject
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
		case <-j.GetCtx().Done():
			err = j.GetCtx().Err()
			return nil, err
		case <-ticker.C:
			out, err := j.client.GetQueryExecutionWithContext(j.GetCtx(), input)
			if err != nil {
				j.CancelWithError(err)
				return nil, err
			}
			status := *out.QueryExecution.Status.State
			j.Logger.Debug().Str("status", status).Send()
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
		j.CancelWithError(err)
		return
	}
	j.Logger.Debug().Msg("job done")
	{
		j.Lock()
		j.ProcessedBytes = *queryExecution.Statistics.DataScannedInBytes
		j.Unlock()
	}
	j.Status() <- int32(proto.Query_JOB_STATUS_READING_RESULTS)
	err = j.storageObject.CopyFromS3(j.GetCtx(), *queryExecution.ResultConfiguration.OutputLocation)
	if err != nil {
		j.CancelWithError(err)
		return
	}
	size, err := j.storageObject.GetSize(j.GetCtx())
	if err != nil {
		j.CancelWithError(err)
		return
	}
	{
		j.Lock()
		j.ResultSize = *size
		resultID := j.GetID()
		j.ResultID = &resultID
		j.Unlock()
	}
	j.Status() <- int32(proto.Query_JOB_STATUS_DONE)
	j.Cancel()
}

func (j *Job) Run(storageObject storage.StorageObject) error {
	j.Lock()
	j.storageObject = storageObject
	j.Unlock()

	var athenaWorkgroup *string
	if os.Getenv("DEKART_ATHENA_WORKGROUP") == "" {
		j.Logger.Warn().Msg("athena workgroup not set or empty, this will default to the primary workgroup")
	} else {
		athenaWorkgroup = aws.String(os.Getenv("DEKART_ATHENA_WORKGROUP"))
		j.Logger.Debug().Msgf("athena workgroup set to %s", *athenaWorkgroup)
	}

	queryString := j.GetQueryText()
	out, err := j.client.StartQueryExecutionWithContext(j.GetCtx(), &athena.StartQueryExecutionInput{
		QueryString: &queryString,
		ResultConfiguration: &athena.ResultConfiguration{
			OutputLocation: &j.outputLocation,
		},
		WorkGroup: athenaWorkgroup,
	})
	if err != nil {
		j.Logger.Error().Err(err).Msg("Error starting query execution")
		j.CancelWithError(err)
		return nil
	}

	j.Lock()
	j.queryExecutionId = *out.QueryExecutionId
	j.Unlock()

	j.Status() <- int32(proto.Query_JOB_STATUS_RUNNING)

	j.Logger.Debug().Str("queryExecutionId", j.queryExecutionId).Msg("waiting")
	go j.wait()
	return nil
}
