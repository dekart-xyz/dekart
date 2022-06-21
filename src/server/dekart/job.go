package dekart

import (
	"context"
	"dekart/src/server/storage"
)

// Store is the interface for the job storage; it allows the cancellation of a job
type JobStore interface {
	Create(reportID string, queryID string, queryText string) (Job, chan int32, error)
	Cancel(queryID string)
}

// Job is the interface for the query job in datasource like BigQuery or Athena
type Job interface {
	GetID() string
	GetReportID() string
	GetQueryID() string
	GetResultID() *string // uuid; nil means no result yet
	GetTotalRows() int64
	GetProcessedBytes() int64
	GetResultSize() int64
	GetCtx() context.Context
	Err() string
	Run(storageObject storage.StorageObject) error
}
