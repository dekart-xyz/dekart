package job

import (
	"context"
	"fmt"
	"io"
	"sync"

	"cloud.google.com/go/bigquery"
	bqStorage "cloud.google.com/go/bigquery/storage/apiv1"
	bqStoragePb "google.golang.org/genproto/googleapis/cloud/bigquery/storage/v1"
)

func (job *Job) readFromResultTable(table *bigquery.Table, csvRows chan []string) {
	defer close(csvRows)
	bqReadClient := job.newBigQueryReadClient()
	defer bqReadClient.Close()

	session, err := job.createReadSession(bqReadClient, table)
	if err != nil {
		job.cancelWithError(err)
		return
	}

	tableDecoder, err := NewDecoder(session)
	if err != nil {
		job.logger.Error().Err(err).Msg("cannot create avro table decoder")
		job.cancelWithError(err)
		return
	}

	csvRows <- tableDecoder.tableFields

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
		go job.proccessStreamResponse(resCh, csvRows, tableDecoder, stream.Name, &proccessWaitGroup)
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

func (job *Job) proccessStreamResponse(resCh chan *bqStoragePb.ReadRowsResponse, csvRows chan []string, tableDecoder *Decoder, readStream string, proccessWaitGroup *sync.WaitGroup) {
	defer proccessWaitGroup.Done()
	defer job.logger.Debug().Str("readStream", readStream).Msg("proccessStreamResponse Done")
	var err error
	for {
		select {
		case <-job.Ctx.Done():
			return
		case res, ok := <-resCh:
			if !ok {
				return
			}
			if res == nil {
				err = fmt.Errorf("res is nil")
				job.logger.Err(err).Send()
				job.cancelWithError(err)
				return
			}
			if res.GetRowCount() > 0 {
				// log.Debug().Msgf("RowsCount: %d", res.GetRowCount())
				rows := res.GetAvroRows()
				if rows == nil {
					err = fmt.Errorf("rows is nil")
					job.logger.Err(err).Send()
					job.cancelWithError(err)
					return
				}
				undecoded := rows.GetSerializedBinaryRows()
				err = tableDecoder.DecodeRows(undecoded, csvRows)
				if err != nil {
					job.logger.Err(err).Send()
					job.cancelWithError(err)
					return
				}
			}
		}
	}
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

func (job *Job) createReadSession(bqReadClient *bqStorage.BigQueryReadClient, table *bigquery.Table) (*bqStoragePb.ReadSession, error) {
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
	if session == nil && err != nil {
		if err == nil {
			err = fmt.Errorf("session == nil")
		}
	}
	if err != nil {
		job.logger.Error().Err(err).Msg("Cannot create read session")
	}
	return session, err
}
