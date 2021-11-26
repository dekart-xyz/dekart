package job

import (
	"dekart/src/proto"
	"dekart/src/server/uuid"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"reflect"
	"regexp"
	"strconv"
	"sync"
	"time"

	"context"

	"cloud.google.com/go/bigquery"
	bqStorage "cloud.google.com/go/bigquery/storage/apiv1"
	"cloud.google.com/go/storage"
	gax "github.com/googleapis/gax-go/v2"
	goavro "github.com/linkedin/goavro/v2"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"google.golang.org/api/googleapi"
	bqStoragePb "google.golang.org/genproto/googleapis/cloud/bigquery/storage/v1"
	"google.golang.org/grpc"
)

// rpcOpts is used to configure the underlying gRPC client to accept large
// messages.  The BigQuery Storage API may send message blocks up to 128MB
// in size, see https://cloud.google.com/bigquery/docs/reference/storage/libraries
var rpcOpts = gax.WithGRPCOptions(
	grpc.MaxCallRecvMsgSize(1024 * 1024 * 129),
)

// Job of quering db, concurency safe
type Job struct {
	ID                  string
	QueryID             string
	ReportID            string
	Ctx                 context.Context
	cancel              context.CancelFunc
	bigqueryJob         *bigquery.Job
	Status              chan int32
	err                 string
	totalRows           int64
	processedBytes      int64
	resultSize          int64
	resultID            *string
	storageObj          *storage.ObjectHandle
	mutex               sync.Mutex
	logger              zerolog.Logger
	maxReadStreamsCount int32
	maxBytesBilled      int64
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
var orderByRe = regexp.MustCompile(`(?ims)order[\s]+by`)

func (job *Job) close(storageWriter *storage.Writer, csvWriter *csv.Writer) {
	csvWriter.Flush()
	err := storageWriter.Close()
	if err != nil {
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
	attrs := storageWriter.Attrs()
	job.mutex.Lock()
	// TODO: use bool done or better new status values
	job.resultID = &job.ID
	if attrs != nil {
		job.resultSize = attrs.Size
	}
	job.mutex.Unlock()
	job.Status <- int32(proto.Query_JOB_STATUS_DONE)
	job.cancel()
}

func (job *Job) setJobStats(queryStatus *bigquery.JobStatus, table *bigquery.Table) error {
	tableMetadata, err := table.Metadata(job.Ctx)
	if err != nil {
		return err
	}
	job.mutex.Lock()
	defer job.mutex.Unlock()
	if queryStatus.Statistics != nil {
		job.processedBytes = queryStatus.Statistics.TotalBytesProcessed
	}
	job.totalRows = int64(tableMetadata.NumRows)
	return nil
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
			job.logger.Err(err).Send()
			job.cancelWithError(err)
			break
		}
	}
	job.close(storageWriter, csvWriter)
}

func (job *Job) cancelWithError(err error) {
	job.mutex.Lock()
	job.err = err.Error()
	job.mutex.Unlock()
	job.Status <- 0
	job.cancel()
}

type AvroSchema struct {
	Fields []struct {
		Name string `json:"name"`
	} `json:"fields"`
}

func (job *Job) proccessApiErrors(err error) {
	if apiError, ok := err.(*googleapi.Error); ok {
		for _, e := range apiError.Errors {
			if e.Reason == "bytesBilledLimitExceeded" {
				job.logger.Warn().Str(
					"DEKART_BIGQUERY_MAX_BYTES_BILLED", os.Getenv("DEKART_BIGQUERY_MAX_BYTES_BILLED"),
				).Msg(e.Message)
			}
		}
	}
}

func (job *Job) getResultTable() (*bigquery.Table, error) {
	jobConfig, err := job.bigqueryJob.Config()
	if err != nil {
		return nil, err
	}
	// log.Debug().Msgf("jobConfig %+v", jobConfig)
	jobConfigVal := reflect.ValueOf(jobConfig).Elem()
	table, ok := jobConfigVal.FieldByName("Dst").Interface().(*bigquery.Table)
	if !ok {
		err := fmt.Errorf("cannot get destination table from job config")
		job.logger.Error().Err(err).Str("jobConfig", fmt.Sprintf("%v+", jobConfig)).Send()
		return nil, err
	}
	return table, nil
}

func (job *Job) wait() {
	queryStatus, err := job.bigqueryJob.Wait(job.Ctx)
	if err == context.Canceled {
		return
	}
	if err != nil {
		job.proccessApiErrors(err)
		job.cancelWithError(err)
		return
	}
	if queryStatus == nil {
		job.logger.Fatal().Msgf("queryStatus == nil")
	}
	if err := queryStatus.Err(); err != nil {
		job.cancelWithError(err)
		return
	}

	table, err := job.getResultTable()
	if err != nil {
		job.cancelWithError(err)
		return
	}

	err = job.setJobStats(queryStatus, table)
	if err != nil {
		job.cancelWithError(err)
		return
	}

	// TODO: reading result as separate state
	job.Status <- int32(queryStatus.State)

	go job.readFromResultTable(table)
}

func (job *Job) newBigQueryReadClient() *bqStorage.BigQueryReadClient {
	bqReadClient, err := bqStorage.NewBigQueryReadClient(job.Ctx)
	if err != nil {
		job.cancelWithError(err)
		job.logger.Fatal().Err(err).Msg("cannot create bigquery read client")
	}
	if bqReadClient == nil {
		err = fmt.Errorf("bqReadClient is nil")
		job.cancelWithError(err)
		job.logger.Fatal().Err(err).Msg("cannot create bigquery read client")
	}
	return bqReadClient
}

func (job *Job) readFromResultTable(table *bigquery.Table) {
	bqReadClient := job.newBigQueryReadClient()
	defer bqReadClient.Close()

	createReadSessionRequest := &bqStoragePb.CreateReadSessionRequest{
		Parent: "projects/" + table.ProjectID,
		ReadSession: &bqStoragePb.ReadSession{
			Table: fmt.Sprintf("projects/%s/datasets/%s/tables/%s",
				table.ProjectID, table.DatasetID, table.TableID),
			DataFormat: bqStoragePb.DataFormat_AVRO,
		},
		MaxStreamCount: job.maxReadStreamsCount,
	}
	session, err := bqReadClient.CreateReadSession(job.Ctx, createReadSessionRequest, rpcOpts)
	if err != nil {
		job.logger.Error().Err(err).Msg("cannot create read session")
		job.cancelWithError(err)
		return
	}
	if session == nil {
		err = fmt.Errorf("session is nil")
		job.logger.Error().Err(err).Send()
		job.cancelWithError(err)
		return
	}

	// crete AVRO codec
	// log.Debug().Msgf("GetSchema %+v", session.GetAvroSchema().GetSchema())
	avroSchema := session.GetAvroSchema()
	if avroSchema == nil {
		err = fmt.Errorf("avroSchema is nil")
		job.logger.Error().Err(err).Send()
		job.cancelWithError(err)
		return
	}

	var avroSchemaFields AvroSchema
	err = json.Unmarshal([]byte(avroSchema.GetSchema()), &avroSchemaFields)
	if err != nil {
		job.logger.Error().Err(err).Msg("cannot unmarshal avro schema")
		job.cancelWithError(err)
		return
	}

	// log.Debug().Msgf("avroSchemaFields is %+v", avroSchemaFields)
	tableFields := make([]string, len(avroSchemaFields.Fields))

	for i := range avroSchemaFields.Fields {
		tableFields[i] = avroSchemaFields.Fields[i].Name
	}
	// log.Debug().Msgf("tableFields is %+v", tableFields)

	csvRows := make(chan []string, job.totalRows)
	defer close(csvRows)
	go job.write(csvRows)

	csvRows <- tableFields

	// create avro codec
	codec, err := goavro.NewCodec(avroSchema.GetSchema())
	if err != nil {
		job.logger.Error().Str("schema", avroSchema.GetSchema()).Err(err).Msg("cannot create AVRO codec")
		job.cancelWithError(err)
		return
	}
	if codec == nil {
		err = fmt.Errorf("codec is nil")
		job.logger.Error().Err(err).Msg("cannot create AVRO codec")
		job.cancelWithError(err)
		return
	}

	// log.Debug().Msgf("session %+v", session.GetStreams()[0])

	readStreams := session.GetStreams()

	if len(readStreams) == 0 {
		err := fmt.Errorf("no streams in read session")
		job.logger.Error().Err(err).Send()
		job.cancelWithError(err)
		return
	}
	job.logger.Debug().Int32("maxReadStreamsCount", job.maxReadStreamsCount).Msgf("Number of Streams %d", len(readStreams))
	var proccessWaitGroup sync.WaitGroup
	for _, stream := range readStreams {
		resCh := make(chan *bqStoragePb.ReadRowsResponse, 1024)
		proccessWaitGroup.Add(1)
		go job.proccessStreamResponse(resCh, csvRows, avroSchema.GetSchema(), tableFields, stream.Name, &proccessWaitGroup)
		go job.readStream(bqReadClient, stream.Name, resCh)
	}

	proccessWaitGroup.Wait() // to close channels and client, see defer statements
	job.logger.Debug().Msg("All Reading Streams Done")
}

func (job *Job) readStream(
	bqReadClient *bqStorage.BigQueryReadClient,
	readStream string,
	resCh chan *bqStoragePb.ReadRowsResponse,
) {
	logger := job.logger.With().Str("readStream", readStream).Logger()
	logger.Debug().Msg("Start Reading Stream")
	defer close(resCh)
	defer logger.Debug().Msg("Finish Reading Stream")
	rowStream, err := bqReadClient.ReadRows(job.Ctx, &bqStoragePb.ReadRowsRequest{
		ReadStream: readStream,
	}, rpcOpts)
	if err != nil {
		job.logger.Err(err).Msg("cannot read rows from stream")
		job.cancelWithError(err)
		return
	}
	for {
		res, err := rowStream.Recv()

		if err != nil {
			if err == io.EOF {
				break
			}
			if err == context.Canceled {
				break
			}
			if contextCancelledRe.MatchString(err.Error()) {
				break
			}
			job.logger.Err(err).Msg("cannot read rows from stream")
			job.cancelWithError(err)
			return
		}
		resCh <- res
	}
}

func (job *Job) proccessStreamResponse(resCh chan *bqStoragePb.ReadRowsResponse, csvRows chan []string, avroSchema string, tableFields []string, readStream string, proccessWaitGroup *sync.WaitGroup) {
	defer proccessWaitGroup.Done()
	defer job.logger.Debug().Str("readStream", readStream).Msg("proccessStreamResponse Done")
	codec, err := goavro.NewCodec(avroSchema)
	if err != nil {
		job.logger.Error().Str("schema", avroSchema).Err(err).Msg("cannot create AVRO codec")
		job.cancelWithError(err)
		return
	}
	if codec == nil {
		err = fmt.Errorf("codec is nil")
		job.logger.Error().Err(err).Msg("cannot create AVRO codec")
		job.cancelWithError(err)
		return
	}
	for {
		select {
		case <-job.Ctx.Done():
			return
		case res, ok := <-resCh:
			if !ok {
				return
			}
			if res == nil {
				err := fmt.Errorf("res is nil")
				job.logger.Err(err).Send()
				job.cancelWithError(err)
				return
			}
			if res.GetRowCount() > 0 {
				// log.Debug().Msgf("RowsCount: %d", res.GetRowCount())
				rows := res.GetAvroRows()
				if rows == nil {
					err := fmt.Errorf("rows is nil")
					job.logger.Err(err).Send()
					job.cancelWithError(err)
					return
				}
				undecoded := rows.GetSerializedBinaryRows()
				for len(undecoded) > 0 {
					var datum interface{}
					datum, undecoded, err = codec.NativeFromBinary(undecoded)
					if err != nil {
						if err == io.EOF {
							break
						}
						job.logger.Err(err).Msg("cannot decode AVRO")
						job.cancelWithError(err)
						return
					}
					valuesMap, ok := datum.(map[string]interface{})
					if !ok {
						err = fmt.Errorf("cannot convert datum to map")
						job.logger.Err(err).Send()
						job.cancelWithError(err)
						return
					}
					//TODO: create once?
					csvRow := make([]string, len(tableFields))
					for i, name := range tableFields {
						value := valuesMap[name]
						if value == nil {
							csvRow[i] = ""
							continue
						}
						valueMap, ok := value.(map[string]interface{})
						if !ok {
							err = fmt.Errorf("cannot convert value to map: value %+v", value)
							job.logger.Err(err).Send()
							job.cancelWithError(err)
							return
						}
						for _, v := range valueMap {
							csvRow[i] = fmt.Sprintf("%v", v)
							break
						}
					}
					csvRows <- csvRow
				}
			}
		}
	}
}

func (job *Job) setMaxReadStreamsCount(queryText string) {
	job.mutex.Lock()
	defer job.mutex.Unlock()
	if orderByRe.MatchString(queryText) {
		job.maxReadStreamsCount = 1 // keep order of items
	} else {
		job.maxReadStreamsCount = 10
	}
}

// Run implementation
func (job *Job) Run(queryText string, obj *storage.ObjectHandle) error {
	job.logger.Debug().Msg("Run BigQuery Job")
	client, err := bigquery.NewClient(job.Ctx, os.Getenv("DEKART_BIGQUERY_PROJECT_ID"))
	if err != nil {
		job.cancel()
		return err
	}
	query := client.Query(queryText)
	query.MaxBytesBilled = job.maxBytesBilled

	job.setMaxReadStreamsCount(queryText)

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
	job.logger.Debug().Msg("Waiting for results")
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
