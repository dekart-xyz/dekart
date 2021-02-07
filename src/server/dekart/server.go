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

//GetTokens implementation
func (s Server) GetTokens(ctx context.Context, req *proto.GetTokensRequest) (*proto.GetTokensResponse, error) {
	tokens := []*proto.GetTokensResponse_Token{
		{
			Name:  "mapbox",
			Token: os.Getenv("DEKART_MAPBOX_TOKEN"),
		},
	}
	return &proto.GetTokensResponse{
		Tokens: tokens,
	}, nil
}
