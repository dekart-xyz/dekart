package dekart

import (
	"context"
	"dekart/src/proto"
	"encoding/csv"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"cloud.google.com/go/bigquery"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func getUUID() string {
	u, err := uuid.NewRandom()
	if err != nil {
		log.Fatal().Err(err).Send()
		return ""
	}
	return u.String()
}

func (s Server) readJobResult(ctx context.Context, job *bigquery.Job, queryID string, reportID string) {
	resultID := getUUID()
	file, err := os.Create(filepath.Join(
		os.Getenv("DEKART_QUERY_RESULTS"),
		fmt.Sprintf("%s.csv", resultID),
	))
	if err != nil {
		log.Fatal().Err(err).Send()
		return
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	defer writer.Flush()

	it, err := job.Read(ctx)
	if err != nil {
		log.Err(err).Send()
		return
	}
	firstLine := true
	for {
		var row []bigquery.Value
		err := it.Next(&row)
		if err == iterator.Done {
			break
		}
		if firstLine {
			firstLine = false
			csvRow := make([]string, len(row), len(row))
			for i, fieldSchema := range it.Schema {
				csvRow[i] = fieldSchema.Name
				// fmt.Println(fieldSchema.Name, fieldSchema.Type)
			}
			err = writer.Write(csvRow)
			if err != nil {
				log.Err(err).Send()
				return
			}
		}
		if err != nil {
			log.Err(err).Send()
			return
		}
		csvRow := make([]string, len(row), len(row))
		for i, v := range row {
			csvRow[i] = fmt.Sprintf("%v", v)
		}
		err = writer.Write(csvRow)
		if err != nil {
			log.Err(err).Send()
			return
		}
	}
	err = s.setJobResult(ctx, queryID, reportID, resultID)
	if err != nil {
		log.Err(err).Send()
		return
	}
}

func (s Server) waitJob(job *bigquery.Job, queryID string, reportID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	queryStatus, err := job.Wait(ctx)
	if err != nil {
		log.Info().Err(err).Send()
		err = s.setJobStatus(ctx, queryID, reportID, 0)
		return
	}
	if err := queryStatus.Err(); err != nil {
		log.Info().Err(err).Send()
		err = s.setJobStatus(ctx, queryID, reportID, 0)
		return
	}
	err = s.setJobStatus(ctx, queryID, reportID, int(queryStatus.State))
	if err != nil {
		log.Err(err).Send()
		return
	}
	s.readJobResult(ctx, job, queryID, reportID)
}

func (s Server) setJobStatus(ctx context.Context, queryID string, reportID string, status int) error {
	//TODO: optimistic lock for job status
	_, err := s.Db.ExecContext(
		ctx,
		"update queries set job_status = $1 where id  = $2",
		status,
		queryID,
	)
	if err != nil {
		return err
	}
	s.ReportStreams.Ping(reportID)
	return nil
}

func (s Server) setJobResult(ctx context.Context, queryID string, reportID string, jobResultID string) error {
	_, err := s.Db.ExecContext(
		ctx,
		"update queries set job_result_id = $1 where id  = $2",
		jobResultID,
		queryID,
	)
	if err != nil {
		return err
	}
	s.ReportStreams.Ping(reportID)
	return nil
}

func (s Server) RunQuery(ctx context.Context, req *proto.RunQueryRequest) (*proto.RunQueryResponse, error) {
	queriesRows, err := s.Db.QueryContext(ctx,
		"select query_text, report_id from queries where id=$1 limit 1",
		req.QueryId,
	)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	defer queriesRows.Close()
	var queryText string
	var reportID string
	for queriesRows.Next() {
		err := queriesRows.Scan(&queryText, &reportID)
		if err != nil {
			log.Err(err).Send()
			return nil, status.Error(codes.Internal, err.Error())
		}
	}
	bigqueryClient, err := bigquery.NewClient(ctx, os.Getenv("DEKART_BIGQUERY_PROJECT_ID"))
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	defer bigqueryClient.Close()

	q := bigqueryClient.Query(queryText)
	job, err := q.Run(ctx)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	//TODO: continuesly update status
	err = s.setJobStatus(ctx, req.QueryId, reportID, 2)
	if err != nil {
		log.Err(err).Send()
		return nil, status.Error(codes.Internal, err.Error())
	}
	go s.waitJob(job, req.QueryId, reportID)
	res := &proto.RunQueryResponse{}
	return res, nil
}
