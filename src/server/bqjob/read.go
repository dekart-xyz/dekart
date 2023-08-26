package bqjob

import (
	"context"
	"dekart/src/server/user"
	"fmt"
	"io"
	"sync"

	"cloud.google.com/go/bigquery"
	bqStorage "cloud.google.com/go/bigquery/storage/apiv1"
	gax "github.com/googleapis/gax-go/v2"
	"github.com/rs/zerolog"
	"google.golang.org/api/option"
	bqStoragePb "google.golang.org/genproto/googleapis/cloud/bigquery/storage/v1"
	"google.golang.org/grpc"
)

type Reader struct {
	ctx                 context.Context
	table               *bigquery.Table
	bqReadClient        *bqStorage.BigQueryReadClient
	logger              zerolog.Logger
	maxReadStreamsCount int32
	tableDecoder        *Decoder
	session             *bqStoragePb.ReadSession
}

// create new Reader
func NewReader(
	ctx context.Context,
	errors chan error,
	csvRows chan []string,
	table *bigquery.Table,
	logger zerolog.Logger,
	maxReadStreamsCount int32,
	// token *oauth2.Token,
) (*Reader, error) {
	r := &Reader{
		ctx:                 ctx,
		table:               table,
		logger:              logger,
		maxReadStreamsCount: maxReadStreamsCount,
	}
	var err error
	tokenSource := user.GetTokenSource(ctx)
	if tokenSource != nil {
		r.bqReadClient, err = bqStorage.NewBigQueryReadClient(
			r.ctx,
			option.WithTokenSource(tokenSource),
		)
	} else {
		r.bqReadClient, err = bqStorage.NewBigQueryReadClient(r.ctx)
	}
	if err != nil || r.bqReadClient == nil {
		r.logger.Fatal().Err(err).Msg("cannot create bigquery read client")
	}
	createReadSessionRequest := &bqStoragePb.CreateReadSessionRequest{
		Parent: "projects/" + r.table.ProjectID,
		ReadSession: &bqStoragePb.ReadSession{
			Table: fmt.Sprintf("projects/%s/datasets/%s/tables/%s",
				r.table.ProjectID, r.table.DatasetID, r.table.TableID),
			DataFormat: bqStoragePb.DataFormat_AVRO,
		},
		MaxStreamCount: r.maxReadStreamsCount,
	}
	r.session, err = r.bqReadClient.CreateReadSession(r.ctx, createReadSessionRequest, rpcOpts)
	if err != nil {
		//TODO: context canceled
		r.logger.Error().Err(err).Msg("cannot create read session")
		return r, err
	}
	r.tableDecoder, err = NewDecoder(r.session)
	if err != nil {
		r.logger.Error().Err(err).Msg("cannot create avro table decoder")
		return r, err
	}
	return r, err
}

func (r *Reader) close() {
	if r.bqReadClient != nil {
		err := r.bqReadClient.Close()
		if err != nil {
			r.logger.Err(err).Send()
		}
	}
}

func (r *Reader) getTableFields() []string {
	return r.tableDecoder.tableFields
}

func (r *Reader) getStreams() ([]*bqStoragePb.ReadStream, error) {
	readStreams := r.session.GetStreams()
	if len(readStreams) == 0 {
		err := fmt.Errorf("no streams in read session")
		r.logger.Error().Err(err).Send()
		return readStreams, err
	}
	r.logger.Debug().Int32("maxReadStreamsCount", r.maxReadStreamsCount).Msgf("Number of Streams %d", len(readStreams))
	return readStreams, nil
}

type StreamReader struct {
	Reader
	resCh      chan *bqStoragePb.ReadRowsResponse
	streamName string
	errors     chan error
	csvRows    chan []string
	logger     zerolog.Logger
}

func (r *StreamReader) read(proccessWaitGroup *sync.WaitGroup) {
	go r.proccessStreamResponse(proccessWaitGroup)
	go r.readStream()
}

func (r *Reader) newStreamReader(streamName string, csvRows chan []string, errors chan error, logger zerolog.Logger) *StreamReader {
	resCh := make(chan *bqStoragePb.ReadRowsResponse, 1024)
	streamReader := StreamReader{
		Reader:     *r,
		resCh:      resCh,
		streamName: streamName,
		errors:     errors,
		csvRows:    csvRows,
		logger:     logger.With().Str("streamName", streamName).Logger(),
	}
	return &streamReader
}

func Read(
	ctx context.Context,
	errors chan error,
	csvRows chan []string,
	table *bigquery.Table,
	logger zerolog.Logger,
	maxReadStreamsCount int32,
	// token *oauth2.Token,
) {
	defer close(errors)
	defer close(csvRows)
	r, err := NewReader(ctx, errors, csvRows, table, logger, maxReadStreamsCount)
	if err != nil {
		errors <- err
		return
	}
	defer r.close()

	csvRows <- r.getTableFields()
	readStreams, err := r.getStreams()
	if err != nil {
		errors <- err
		return
	}

	var proccessWaitGroup sync.WaitGroup
	for _, stream := range readStreams {
		proccessWaitGroup.Add(1)
		r.newStreamReader(stream.Name, csvRows, errors, logger).read(&proccessWaitGroup)
	}

	proccessWaitGroup.Wait() // to close channels and client, see defer statements
	r.logger.Debug().Msg("All Reading Streams Done")
}

// rpcOpts is used to configure the underlying gRPC client to accept large
// messages.  The BigQuery Storage API may send message blocks up to 128MB
// in size, see https://cloud.google.com/bigquery/docs/reference/storage/libraries
var rpcOpts = gax.WithGRPCOptions(
	grpc.MaxCallRecvMsgSize(1024 * 1024 * 129),
)

func (r *StreamReader) readStream() {
	r.logger.Debug().Msg("Start Reading Stream")
	defer close(r.resCh)
	defer r.logger.Debug().Msg("Finish Reading Stream")
	rowStream, err := r.bqReadClient.ReadRows(r.ctx, &bqStoragePb.ReadRowsRequest{
		ReadStream: r.streamName,
	}, rpcOpts)
	if err != nil {
		r.logger.Err(err).Msg("cannot read rows from stream")
		r.errors <- err
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
			r.logger.Err(err).Msg("cannot read rows from stream")
			r.errors <- err
			return
		}
		r.resCh <- res
	}
}

func (r *StreamReader) proccessStreamResponse(proccessWaitGroup *sync.WaitGroup) {
	defer proccessWaitGroup.Done()
	defer r.logger.Debug().Str("readStream", r.streamName).Msg("proccessStreamResponse Done")
	var err error
	for {
		select {
		case <-r.ctx.Done():
			return
		case res, ok := <-r.resCh:
			if !ok {
				return
			}
			if res == nil {
				err = fmt.Errorf("res is nil")
				r.logger.Err(err).Send()
				r.errors <- err
				return
			}
			if res.GetRowCount() > 0 {
				rows := res.GetAvroRows()
				if rows == nil {
					err = fmt.Errorf("rows is nil")
					r.logger.Err(err).Send()
					r.errors <- err
					return
				}
				undecoded := rows.GetSerializedBinaryRows()
				err = r.tableDecoder.DecodeRows(undecoded, r.csvRows)
				if err != nil {
					r.logger.Err(err).Send()
					r.errors <- err
					return
				}
			}
		}
	}
}
