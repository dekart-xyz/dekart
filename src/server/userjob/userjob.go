package userjob

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/bqjob"
	"dekart/src/server/conn"
	"dekart/src/server/job"
	"dekart/src/server/snowflakejob"
	"dekart/src/server/wherobotsjob"
)

type Store struct {
	job.BasicStore
}

func NewStore() *Store {
	store := &Store{}
	return store
}

func (s *Store) TestConnection(ctx context.Context, req *proto.TestConnectionRequest) (*proto.TestConnectionResponse, error) {
	if req.Connection.ConnectionType == proto.ConnectionType_CONNECTION_TYPE_SNOWFLAKE {
		return snowflakejob.TestConnection(ctx, req)
	}
	if req.Connection.ConnectionType == proto.ConnectionType_CONNECTION_TYPE_WHEROBOTS {
		return wherobotsjob.TestConnection(ctx, req)
	}

	return bqjob.TestConnection(ctx, req)
}

func (s *Store) Create(reportID string, queryID string, queryText string, connCtx context.Context) (job.Job, chan int32, error) {
	var err error
	var job job.Job
	connection := conn.FromCtx(connCtx)
	if connection.ConnectionType == proto.ConnectionType_CONNECTION_TYPE_SNOWFLAKE {
		job, err = snowflakejob.Create(reportID, queryID, queryText, connCtx)
	} else if connection.ConnectionType == proto.ConnectionType_CONNECTION_TYPE_WHEROBOTS {
		job, err = wherobotsjob.Create(reportID, queryID, queryText, connCtx)
	} else {
		job, err = bqjob.Create(reportID, queryID, queryText, connCtx)
	}
	if err != nil {
		return nil, nil, err
	}
	s.StoreJob(job)
	go s.RemoveJobWhenDone(job)
	return job, job.Status(), nil

}
