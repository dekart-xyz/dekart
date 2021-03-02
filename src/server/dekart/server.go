package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/job"
	"dekart/src/server/report"
	"os"

	"cloud.google.com/go/storage"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Server is Dekart Endpoints implementation (HTTP and GRPC)
type Server struct {
	db            *sql.DB
	reportStreams *report.Streams
	bucket        *storage.BucketHandle
	proto.UnimplementedDekartServer
	jobs *job.Store
}

//Unauthenticated error returned when no user claims in context
var Unauthenticated error = status.Error(codes.Unauthenticated, "UNAUTHENTICATED")

// NewServer returns new Dekart Server
func NewServer(db *sql.DB, bucket *storage.BucketHandle, jobs *job.Store) *Server {
	server := Server{
		db:            db,
		reportStreams: report.NewStreams(),
		bucket:        bucket,
		jobs:          jobs,
	}
	return &server

}

// GetEnv variables to the client
func (s Server) GetEnv(ctx context.Context, req *proto.GetEnvRequest) (*proto.GetEnvResponse, error) {
	variables := []*proto.GetEnvResponse_Variable{
		{
			Type:  proto.GetEnvResponse_Variable_TYPE_MAPBOX_TOKEN,
			Value: os.Getenv("DEKART_MAPBOX_TOKEN"),
		},
		{
			Type:  proto.GetEnvResponse_Variable_TYPE_UX_DATA_DOCUMENTATION,
			Value: os.Getenv("DEKART_UX_DATA_DOCUMENTATION"),
		},
	}
	return &proto.GetEnvResponse{
		Variables: variables,
	}, nil
}
