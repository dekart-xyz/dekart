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
	logger         zerolog.Logger
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
			job.logger.Err(err).Send()
			job.cancelWithError(err)
			break
		}
	}
	job.close(storageWriter, csvWriter)
}

// read rows from bigquery response and send to csvRows channel
// func (job *Job) read(it *bigquery.RowIterator, csvRows chan []string) {
// 	firstLine := true
// 	for {
// 		var row []bigquery.Value
// 		err := it.Next(&row)
// 		if err == iterator.Done {
// 			break
// 		}
// 		if err == context.Canceled {
// 			break
// 		}
// 		if err != nil {
// 			job.logger.Err(err).Send()
// 			job.cancelWithError(err)
// 			break
// 		}
// 		if firstLine {
// 			firstLine = false
// 			csvRow := make([]string, len(row))
// 			for i, fieldSchema := range it.Schema {
// 				csvRow[i] = fieldSchema.Name
// 				// fmt.Println(fieldSchema.Name, fieldSchema.Type)
// 			}
// 			csvRows <- csvRow
// 		}
// 		csvRow := make([]string, len(row))
// 		for i, v := range row {
// 			csvRow[i] = fmt.Sprintf("%v", v)
// 		}
// 		csvRows <- csvRow
// 	}
// 	close(csvRows)
// 	job.logger.Debug().Msg("Reading Done")
// }

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

func (job *Job) wait() {
	queryStatus, err := job.bigqueryJob.Wait(job.Ctx)
	if err == context.Canceled {
		return
	}
	if err != nil {
		if apiError, ok := err.(*googleapi.Error); ok {
			for _, e := range apiError.Errors {
				if e.Reason == "bytesBilledLimitExceeded" {
					job.logger.Warn().Str(
						"DEKART_BIGQUERY_MAX_BYTES_BILLED", os.Getenv("DEKART_BIGQUERY_MAX_BYTES_BILLED"),
					).Msg(e.Message)
				}
			}
		}
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

	// get temporary table
	jobConfig, err := job.bigqueryJob.Config()
	if err != nil {
		job.cancelWithError(err)
		return
	}
	log.Debug().Msgf("jobConfig %+v", jobConfig)
	jobConfigVal := reflect.ValueOf(jobConfig).Elem()
	table, ok := jobConfigVal.FieldByName("Dst").Interface().(*bigquery.Table)
	if !ok {
		err := fmt.Errorf("cannot get destination table from job config")
		job.logger.Error().Err(err).Str("jobConfig", fmt.Sprintf("%v+", jobConfig)).Send()
		job.cancelWithError(err)
		return
	}
	log.Debug().Msgf("table %+v", table)
	tableMetadata, err := table.Metadata(job.Ctx)
	if err != nil {
		job.cancelWithError(err)
		return
	}
	log.Debug().Msgf("tableMetadata %+v", tableMetadata)
	job.setJobStats(queryStatus, tableMetadata.NumRows)
	log.Debug().Msgf("queryStatus.State %v %v", queryStatus.State, int32(queryStatus.State))
	// job is done
	// TODO: reading result as separate state
	job.Status <- int32(queryStatus.State)

	bqReadClient, err := bqStorage.NewBigQueryReadClient(job.Ctx)
	if err != nil {
		job.logger.Fatal().Err(err).Msg("cannot create bigquery read client")
	}
	if bqReadClient == nil {
		err = fmt.Errorf("bqReadClient is nil")
		job.logger.Error().Err(err).Send()
		job.cancelWithError(err)
		return
	}
	defer bqReadClient.Close()

	createReadSessionRequest := &bqStoragePb.CreateReadSessionRequest{
		Parent: "projects/" + table.ProjectID,
		ReadSession: &bqStoragePb.ReadSession{
			Table: fmt.Sprintf("projects/%s/datasets/%s/tables/%s",
				table.ProjectID, table.DatasetID, table.TableID),
			DataFormat: bqStoragePb.DataFormat_AVRO,
		},
		MaxStreamCount: 1,
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

	log.Debug().Msgf("avroSchemaFields is %+v", avroSchemaFields)
	tableFields := make([]string, len(avroSchemaFields.Fields))

	for i := range avroSchemaFields.Fields {
		tableFields[i] = avroSchemaFields.Fields[i].Name
	}
	log.Debug().Msgf("tableFields is %+v", tableFields)

	csvRows := make(chan []string, tableMetadata.NumRows)
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

	if len(session.GetStreams()) == 0 {
		err := fmt.Errorf("no streams in read session")
		job.logger.Error().Err(err).Send()
		job.cancelWithError(err)
		return
	}
	log.Debug().Msgf("session %+v", session.GetStreams()[0])

	rowStream, err := bqReadClient.ReadRows(job.Ctx, &bqStoragePb.ReadRowsRequest{
		ReadStream: session.GetStreams()[0].Name,
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
				job.logger.Debug().Msg("EOF")
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
		if res.GetRowCount() > 0 {
			log.Debug().Msgf("RowsCount: %d", res.GetRowCount())
			rows := res.GetAvroRows()
			if rows == nil {
				err = fmt.Errorf("rows is nil")
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
					// log.Debug().Msgf("datum %+v", datum)
					job.logger.Err(err).Send()
					job.cancelWithError(err)
					return
				}
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
				// log.Debug().Msgf("datum %+v", datum)
				// log.Debug().Msgf("csvRow %+v", csvRow)
			}
			// log.Debug().Msgf("GetAvroRows %+v", res.GetAvroRows().)
		}
	}
	job.logger.Debug().Msg("Reading Done")
	// it, err := job.bigqueryJob.Read(job.Ctx)
	// if err != nil {
	// 	job.logger.Err(err).Send()
	// 	job.cancelWithError(err)
	// 	return
	// }
	// // it.PageInfo().MaxSize = 50000
	// job.setJobStats(queryStatus, it.TotalRows)
	// job.Status <- int32(queryStatus.State)

	// csvRows := make(chan []string, it.TotalRows)

	// job.logger.Debug().Uint64("TotalRows", it.TotalRows).Msg("Received iterator")

	// go job.read(it, csvRows)
	// go job.write(csvRows)
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
	maxBytesBilled := os.Getenv("DEKART_BIGQUERY_MAX_BYTES_BILLED")
	if maxBytesBilled != "" {
		query.MaxBytesBilled, err = strconv.ParseInt(maxBytesBilled, 10, 64)
		if err != nil {
			job.cancel()
			job.logger.Fatal().Msgf("Cannot parse DEKART_BIGQUERY_MAX_BYTES_BILLED")
		}
	} else {
		job.logger.Warn().Msgf("DEKART_BIGQUERY_MAX_BYTES_BILLED is not set! Use the maximum bytes billed setting to limit query costs. https://cloud.google.com/bigquery/docs/best-practices-costs#limit_query_costs_by_restricting_the_number_of_bytes_billed")
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
		logger:   log.With().Str("reportID", reportID).Str("queryID", queryID).Logger(),
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
			job.logger.Info().Msg("Canceling Job Context")
			job.cancel()
		}
	}
	s.mutex.Unlock()
}
