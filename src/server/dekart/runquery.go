package dekart

import (
	"context"
	"dekart/src/proto"
	"fmt"
	"os"
	"time"

	"cloud.google.com/go/bigquery"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (s Server) waitJob(job *bigquery.Job, queryID string, reportID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	queryStatus, err := job.Wait(ctx)
	if err != nil {
		log.Info().Err(err).Send()
		err = s.setJobStatus(ctx, queryID, reportID, 0)
		log.Err(err).Send()
		return
		// return nil, status.Error(codes.Internal, err.Error())
	}
	err = s.setJobStatus(ctx, queryID, reportID, int(queryStatus.State))
	if err != nil {
		log.Err(err).Send()
		return
	}
	// if err := queryStatus.Err(); err != nil {
	// 	log.Err(err).Send()
	// 	return
	// 	// return nil, status.Error(codes.Internal, err.Error())
	// }
	// it, err := job.Read(ctx)
	// for {
	// 	var row []bigquery.Value
	// 	err := it.Next(&row)
	// 	if err == iterator.Done {
	// 		break
	// 	}
	// 	if err != nil {
	// 		log.Err(err).Send()
	// 		return
	// 		// return nil, status.Error(codes.Internal, err.Error())
	// 	}
	// 	fmt.Println(row)
	// }
	// fmt.Println(it.Schema)
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
	fmt.Println(bigqueryClient)
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
