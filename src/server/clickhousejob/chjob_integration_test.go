//go:build integration

package chjob

import (
	"context"
	"fmt"
	"io"
	"math/rand"
	"os"
	"testing"
	"time"

	"dekart/src/proto"
	"dekart/src/server/storage"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/rs/zerolog/pkgerrors"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
)

type clickhouseSuiteTest struct {
	suite.Suite
	chStore *Store

	localAWSC      testcontainers.Container
	localstackPort string

	clickhouseC       testcontainers.Container
	clickhouseConnStr string
}

func (s *clickhouseSuiteTest) SetupSuite() {
	t := s.T()
	configureLogger()

	// LocalStack setup
	localAWSC, localstackPort, err := setupLocalStack()
	if err != nil {
		t.Fatalf("Failed to setup LocalStack: %v", err)
	}

	// ClickHouse setup
	clickhouseC, clickhouseConnStr, err := setupClickHouse()
	if err != nil {
		t.Fatalf("Failed to setup ClickHouse: %v", err)
	}

	// set env variables for testing
	os.Setenv("DEKART_CLICKHOUSE_DATA_CONNECTION", clickhouseConnStr)
	os.Setenv("DEKART_CLICKHOUSE_S3_OUTPUT_LOCATION", fmt.Sprintf("%s/files", testBucketName))
	// clickhouse is running in docker, so we need to use host.docker.internal to access localstack from container
	os.Setenv("AWS_ENDPOINT", fmt.Sprintf("http://host.docker.internal:%s", localstackPort))
	os.Setenv("AWS_ACCESS_KEY_ID", "xxx")
	os.Setenv("AWS_SECRET_ACCESS_KEY", "xxx")
	os.Setenv("AWS_INSECURE", "true")
	os.Setenv("AWS_REGION", "us-east-1")

	s.chStore = NewStore()
	s.localAWSC, s.localstackPort = localAWSC, localstackPort
	s.clickhouseC, s.clickhouseConnStr = clickhouseC, clickhouseConnStr
}

func (s *clickhouseSuiteTest) TearDownSuite() {
	ctx := context.Background()
	s.localAWSC.Terminate(ctx)
	s.clickhouseC.Terminate(ctx)
}

func TestAllClickhouseIntegrationsTests(t *testing.T) {
	suite.Run(t, new(clickhouseSuiteTest))
}

func configureLogger() {
	rand.Seed(time.Now().UnixNano())
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	zerolog.ErrorStackFieldName = "stacktrace"
	zerolog.ErrorStackMarshaler = pkgerrors.MarshalStack

	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: time.RFC3339}).With().Caller().Logger()
	zerolog.SetGlobalLevel(zerolog.DebugLevel)
}

// checks the clickhouse integration with S3 output storage
func (s *clickhouseSuiteTest) Test_get_csv_result_in_s3_storage() {
	ctx := context.Background()
	t := s.T()

	reportID := "testreport"
	queryID := "testquery"
	resultFileName := "result.csv"

	// a multi-column query for testing
	query := `SELECT 123 AS testcol, 456 AS testcol2;`

	job, statusChan, err := s.chStore.Create(reportID, queryID, query, ctx)
	if err != nil {
		t.Fatalf("Failed to create job: %v", err)
	}

	store := configureS3Storage(s.localstackPort)
	storageObject := store.GetObject(ctx, testBucketName, resultFileName)

	{
		// the block for running the job and waiting for the status
		// separate block for better readability

		go func(t *testing.T) {
			// the status is a channel, so we need to run it in a goroutine
			err = job.Run(storageObject, nil)
			if err != nil {
				t.Fatalf("Failed to run job: %v", err)
			}
		}(t)

		// we have to wait for the job to complete
		var lastStatus int32
		for {
			// wait for the job to complete
			if lastStatus == int32(proto.Query_JOB_STATUS_DONE) {
				t.Log("Job completed successfully")
				break
			}

			// use select to not be blocked in case with the channel
			select {
			case lastStatus = <-statusChan:
				t.Logf("Job status is %v", lastStatus)
				if lastStatus == int32(proto.Query_JOB_STATUS_DONE) {
					t.Log("Job completed successfully")
					break
				}
			case <-time.After(10 * time.Second):
				t.Fatalf("Job did not complete within timeout")
			}
		}
	}

	fullReportFileLocation := fmt.Sprintf("files/%s/%s/%s", reportID, queryID, resultFileName)
	resultObj := store.GetObject(ctx, testBucketName, fullReportFileLocation)
	objSize, err := resultObj.GetSize(ctx)
	require.NoError(t, err)
	require.Greater(t, *objSize, int64(0))
	t.Logf("File size: %d", *objSize)

	objReader, err := resultObj.GetReader(ctx)
	require.NoError(t, err)
	defer objReader.Close()

	data, err := io.ReadAll(objReader)
	require.NoError(t, err)
	require.NotEmpty(t, data)
	dataStr := string(data)
	require.Contains(t, dataStr, "testcol")
	require.Contains(t, dataStr, "testcol2")
	require.Contains(t, dataStr, "123,456")
	require.Contains(t, dataStr, "456")
}

func configureS3Storage(localstackPort string) storage.Storage {
	// required to be set. hidden dependency
	os.Setenv("AWS_ENDPOINT", fmt.Sprintf("http://localhost:%s", localstackPort))
	os.Setenv("DEKART_CLOUD_STORAGE_BUCKET", testBucketName)
	return storage.NewS3Storage()
}
