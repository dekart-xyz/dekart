package chjob

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"strings"

	"dekart/src/proto"
	"dekart/src/server/job"
	"dekart/src/server/storage"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/rs/zerolog/log"
)

type Store struct {
	job.BasicStore
	clickhouseDB   *sql.DB
	outputLocation string   // outputLocation is the S3 path where the results will be stored
	s3Config       s3Config // s3Config is needed to export the results to S3

}

// s3Config is needed to export the results to S3 using Clickhouse's s3 function (https://clickhouse.com/docs/en/sql-reference/table-functions/s3)
type s3Config struct {
	Endpoint  string
	AccessKey string
	SecretKey string
}

func NewStore() *Store {
	dbConnStr := os.Getenv("DEKART_CLICKHOUSE_DATA_CONNECTION")
	outputLocation := os.Getenv("DEKART_CLICKHOUSE_S3_OUTPUT_LOCATION")
	if outputLocation == "" {
		log.Fatal().Msgf("clickhouse data connection requires DEKART_CLICKHOUSE_S3_OUTPUT_LOCATION")
	}

	s3Cfg := s3Config{
		Endpoint:  os.Getenv("AWS_ENDPOINT"),
		AccessKey: os.Getenv("AWS_ACCESS_KEY_ID"),
		SecretKey: os.Getenv("AWS_SECRET_ACCESS_KEY"),
	}

	// verify required environment variables
	if s3Cfg.Endpoint == "" {
		log.Fatal().Msgf("dekart clickhouse  requires AWS_ENDPOINT")
		return nil
	}
	if s3Cfg.AccessKey == "" {
		log.Fatal().Msgf("dekart clickhouse requires AWS_ACCESS_KEY_ID")
		return nil
	}
	if s3Cfg.SecretKey == "" {
		log.Fatal().Msgf("dekart clickhouse requires AWS_SECRET_ACCESS_KEY")
		return nil
	}

	// verify endpoint scheme
	if !strings.HasPrefix(s3Cfg.Endpoint, "http://") &&
		!strings.HasPrefix(s3Cfg.Endpoint, "https://") {

		log.Fatal().Msgf("invalid AWS endpoint scheme, must be http:// or https://")
		return nil
	}

	opt, err := clickhouse.ParseDSN(dbConnStr)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to clickhouse")
		return nil
	}

	db := clickhouse.OpenDB(opt)

	_, err = db.Exec("SELECT 1")
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to clickhouse")
	}

	return &Store{
		clickhouseDB:   db,
		outputLocation: outputLocation,
		s3Config:       s3Cfg,
	}
}

func (s *Store) Create(reportID string, queryID string, queryText string, userCtx context.Context) (job.Job, chan int32, error) {
	j := &Job{
		BasicJob: job.BasicJob{
			ReportID:  reportID,
			QueryID:   queryID,
			QueryText: queryText,
			Logger:    log.With().Str("reportID", reportID).Str("queryID", queryID).Logger(),
		},
		clickhouseDB:   s.clickhouseDB,
		outputLocation: s.outputLocation,
		s3Config:       s.s3Config,
	}

	j.Init(userCtx)
	s.StoreJob(j)
	go s.RemoveJobWhenDone(j)
	return j, j.Status(), nil
}

type Job struct {
	job.BasicJob
	clickhouseDB   *sql.DB
	outputLocation string
	storageObject  storage.StorageObject
	s3Config       s3Config
}

func (j *Job) wait() {
	j.Status() <- int32(proto.QueryJob_JOB_STATUS_READING_RESULTS)

	// Get location of the results file
	resultLocation := fmt.Sprintf("%s/%s/%s/result.csv", j.outputLocation, j.ReportID, j.QueryID)

	err := j.storageObject.CopyFromS3(j.GetCtx(), resultLocation)
	if err != nil {
		j.CancelWithError(err)
		return
	}

	size, err := j.storageObject.GetSize(j.GetCtx())
	if err != nil {
		j.CancelWithError(err)
		return
	}

	j.Lock()
	j.ResultSize = *size
	j.ResultReady = true
	j.Unlock()

	j.Status() <- int32(proto.QueryJob_JOB_STATUS_DONE)
	j.Cancel()
}

func (j *Job) Run(storageObject storage.StorageObject, _ *proto.Connection) error {
	j.Lock()
	j.storageObject = storageObject
	j.Unlock()
	// Construct S3 path
	s3Path := fmt.Sprintf("%s/%s/%s/%s/result.csv",
		j.s3Config.Endpoint,
		strings.TrimPrefix(j.outputLocation, "s3://"),
		j.ReportID,
		j.QueryID)

	j.Status() <- int32(proto.QueryJob_JOB_STATUS_RUNNING)

	go func() {

		// Export to S3 using Clickhouse's s3 function
		// SETTINGS s3_truncate_on_insert=1 is required to overwrite the file if it already exists
		exportQuery := fmt.Sprintf(`
            INSERT INTO FUNCTION
                s3('%s', '%s', '%s', 'CSVWithNames')
            %s
            SETTINGS s3_truncate_on_insert=1
        `, s3Path, j.s3Config.AccessKey, j.s3Config.SecretKey, strings.TrimSuffix(j.QueryText, ";"))

		_, err := j.clickhouseDB.ExecContext(j.GetCtx(), exportQuery)
		if err != nil {
			j.Logger.Error().Err(err).Msg("Error executing clickhouse query")
			j.CancelWithError(err)
			return
		}
		j.wait()
	}()

	return nil
}
