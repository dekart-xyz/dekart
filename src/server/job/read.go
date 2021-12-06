package job

import (
	"context"
	"fmt"
	"io"
	"sync"

	"cloud.google.com/go/bigquery"
	bqStorage "cloud.google.com/go/bigquery/storage/apiv1"
	"github.com/rs/zerolog"
	bqStoragePb "google.golang.org/genproto/googleapis/cloud/bigquery/storage/v1"
)

type Reader struct {
	ctx                 context.Context
	errors              chan error
	csvRows             chan []string
	table               *bigquery.Table
	bqReadClient        *bqStorage.BigQueryReadClient
	logger              zerolog.Logger
	maxReadStreamsCount int32
	tableDecoder        *Decoder
}

func Read(ctx context.Context, errors chan error, csvRows chan []string, table *bigquery.Table, logger zerolog.Logger, maxReadStreamsCount int32) {
	r := &Reader{
		ctx:                 ctx,
		errors:              errors,
		csvRows:             csvRows,
		table:               table,
		logger:              logger,
		maxReadStreamsCount: maxReadStreamsCount,
	}
	defer close(r.csvRows)
	r.bqReadClient = r.newBigQueryReadClient()
	defer r.bqReadClient.Close()

	session, err := r.createReadSession()
	if err != nil {
		r.errors <- err
		return
	}

	r.tableDecoder, err = NewDecoder(session)
	if err != nil {
		r.logger.Error().Err(err).Msg("cannot create avro table decoder")
		r.errors <- err
		return
	}

	r.csvRows <- r.tableDecoder.tableFields

	readStreams := session.GetStreams()
	if len(readStreams) == 0 {
		err := fmt.Errorf("no streams in read session")
		r.logger.Error().Err(err).Send()
		r.errors <- err
		return
	}
	r.logger.Debug().Int32("maxReadStreamsCount", r.maxReadStreamsCount).Msgf("Number of Streams %d", len(readStreams))
	var proccessWaitGroup sync.WaitGroup
	for _, stream := range readStreams {
		resCh := make(chan *bqStoragePb.ReadRowsResponse, 1024)
		proccessWaitGroup.Add(1)
		go r.proccessStreamResponse(resCh, stream.Name, &proccessWaitGroup)
		go r.readStream(resCh, stream.Name)
	}

	proccessWaitGroup.Wait() // to close channels and client, see defer statements
	r.logger.Debug().Msg("All Reading Streams Done")
}

func (r *Reader) readStream(
	resCh chan *bqStoragePb.ReadRowsResponse,
	readStream string,
) {
	logger := r.logger.With().Str("readStream", readStream).Logger()
	logger.Debug().Msg("Start Reading Stream")
	defer close(resCh)
	defer logger.Debug().Msg("Finish Reading Stream")
	rowStream, err := r.bqReadClient.ReadRows(r.ctx, &bqStoragePb.ReadRowsRequest{
		ReadStream: readStream,
	}, rpcOpts)
	if err != nil {
		logger.Err(err).Msg("cannot read rows from stream")
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
			logger.Err(err).Msg("cannot read rows from stream")
			r.errors <- err
			return
		}
		resCh <- res
	}
}

func (r *Reader) proccessStreamResponse(resCh chan *bqStoragePb.ReadRowsResponse, readStream string, proccessWaitGroup *sync.WaitGroup) {
	defer proccessWaitGroup.Done()
	defer r.logger.Debug().Str("readStream", readStream).Msg("proccessStreamResponse Done")
	var err error
	for {
		select {
		case <-r.ctx.Done():
			return
		case res, ok := <-resCh:
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
				// log.Debug().Msgf("RowsCount: %d", res.GetRowCount())
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

func (r *Reader) newBigQueryReadClient() *bqStorage.BigQueryReadClient {
	bqReadClient, err := bqStorage.NewBigQueryReadClient(r.ctx)
	if err != nil {
		r.logger.Fatal().Err(err).Msg("cannot create bigquery read client")
	}
	if bqReadClient == nil {
		err = fmt.Errorf("bqReadClient is nil")
		r.logger.Fatal().Err(err).Msg("cannot create bigquery read client")
	}
	return bqReadClient
}

func (r *Reader) createReadSession() (*bqStoragePb.ReadSession, error) {
	createReadSessionRequest := &bqStoragePb.CreateReadSessionRequest{
		Parent: "projects/" + r.table.ProjectID,
		ReadSession: &bqStoragePb.ReadSession{
			Table: fmt.Sprintf("projects/%s/datasets/%s/tables/%s",
				r.table.ProjectID, r.table.DatasetID, r.table.TableID),
			DataFormat: bqStoragePb.DataFormat_AVRO,
		},
		MaxStreamCount: r.maxReadStreamsCount,
	}
	session, err := r.bqReadClient.CreateReadSession(r.ctx, createReadSessionRequest, rpcOpts)
	if session == nil && err != nil {
		if err == nil {
			err = fmt.Errorf("session == nil")
		}
	}
	if err != nil {
		r.logger.Error().Err(err).Msg("Cannot create read session")
	}
	return session, err
}
