package dekart

import (
	"context"
	"encoding/csv"
	"fmt"
	"time"

	"cloud.google.com/go/bigquery"
	"cloud.google.com/go/storage"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"google.golang.org/api/iterator"
)

func getUUID() string {
	u, err := uuid.NewRandom()
	if err != nil {
		log.Fatal().Err(err).Send()
		return ""
	}
	return u.String()
}

func (s Server) finishSavingQuery(bucket *storage.Writer, csv *csv.Writer) {
	csv.Flush()
	err := bucket.Close()
	if err != nil {
		log.Err(err).Send()
	}
}

func (s Server) readJobResult(ctx context.Context, job *bigquery.Job, queryID string, reportID string) {
	resultID := getUUID()
	obj := s.bucket.Object(fmt.Sprintf("%s.csv", resultID))
	w := obj.NewWriter(ctx)

	writer := csv.NewWriter(w)
	defer (func() {
		s.finishSavingQuery(w, writer)
		err := s.setJobResult(ctx, queryID, reportID, resultID)
		if err != nil {
			log.Err(err).Send()
			return
		}
	})()

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
}

func (s Server) waitJob(job *bigquery.Job, queryID string, reportID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	queryStatus, err := job.Wait(ctx)
	if err != nil {
		s.setJobError(ctx, queryID, reportID, err)
		return
	}
	if err := queryStatus.Err(); err != nil {
		s.setJobError(ctx, queryID, reportID, err)
	}
	err = s.setJobStatus(ctx, queryID, reportID, int(queryStatus.State))
	if err != nil {
		log.Err(err).Send()
		return
	}
	s.readJobResult(ctx, job, queryID, reportID)
}

func (s Server) setJobError(ctx context.Context, queryID string, reportID string, jobErr error) {
	_, err := s.db.ExecContext(
		ctx,
		"update queries set job_status = 0, job_error=$1 where id  = $2",
		jobErr.Error(),
		queryID,
	)
	if err != nil {
		log.Fatal().Err(err).Send()
		return
	}
	s.reportStreams.Ping(reportID)
}

func (s Server) setJobStatus(ctx context.Context, queryID string, reportID string, status int) error {
	//TODO: optimistic lock for job status
	_, err := s.db.ExecContext(
		ctx,
		"update queries set job_status = $1, job_error = null, job_result_id = null where id  = $2",
		status,
		queryID,
	)
	if err != nil {
		return err
	}
	s.reportStreams.Ping(reportID)
	return nil
}

func (s Server) setJobResult(ctx context.Context, queryID string, reportID string, jobResultID string) error {
	_, err := s.db.ExecContext(
		ctx,
		"update queries set job_result_id = $1 where id  = $2",
		jobResultID,
		queryID,
	)
	if err != nil {
		//TODO: make it fatal
		return err
	}
	s.reportStreams.Ping(reportID)
	return nil
}
