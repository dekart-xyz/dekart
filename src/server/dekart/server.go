package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/job"
	"dekart/src/server/report"
	"dekart/src/server/storage"
	"os"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Server is Dekart Endpoints implementation (HTTP and GRPC)
type Server struct {
	db            *sql.DB
	reportStreams *report.Streams
	storage       storage.Storage
	proto.UnimplementedDekartServer
	jobs job.Store
}

//Unauthenticated error returned when no user claims in context
var Unauthenticated error = status.Error(codes.Unauthenticated, "UNAUTHENTICATED")

// NewServer returns new Dekart Server
// func NewServer(db *sql.DB, bucket *storage.BucketHandle, jobs *job.Store) *Server {
func NewServer(db *sql.DB, storageBucket storage.Storage, jobs job.Store) *Server {
	server := Server{
		db:            db,
		reportStreams: report.NewStreams(),
		storage:       storageBucket,
		jobs:          jobs,
	}
	return &server

}

// Shutdown cancels all jobs
func (s Server) Shutdown(ctx context.Context) {
	s.jobs.CancelAll(ctx)
}

func defaultString(s, def string) string {
	if s == "" {
		return def
	}
	return s
}

// GetEnv variables to the client
func (s Server) GetEnv(ctx context.Context, req *proto.GetEnvRequest) (*proto.GetEnvResponse, error) {
	homePageUrl := os.Getenv("DEKART_UX_HOMEPAGE")
	if homePageUrl == "" {
		homePageUrl = "https://dekart.xyz/"
	}
	variables := []*proto.GetEnvResponse_Variable{
		{
			Type:  proto.GetEnvResponse_Variable_TYPE_MAPBOX_TOKEN,
			Value: os.Getenv("DEKART_MAPBOX_TOKEN"),
		},
		{
			Type:  proto.GetEnvResponse_Variable_TYPE_UX_DATA_DOCUMENTATION,
			Value: os.Getenv("DEKART_UX_DATA_DOCUMENTATION"),
		},
		{
			Type:  proto.GetEnvResponse_Variable_TYPE_UX_HOMEPAGE,
			Value: homePageUrl,
		},
		{
			Type:  proto.GetEnvResponse_Variable_TYPE_ALLOW_FILE_UPLOAD,
			Value: os.Getenv("DEKART_ALLOW_FILE_UPLOAD"),
		},
		{
			Type:  proto.GetEnvResponse_Variable_TYPE_DATASOURCE,
			Value: defaultString(os.Getenv("DEKART_DATASOURCE"), "BQ"),
		},
		{
			Type:  proto.GetEnvResponse_Variable_TYPE_STORAGE,
			Value: defaultString(os.Getenv("DEKART_STORAGE"), "GCS"),
		},
		{
			Type:  proto.GetEnvResponse_Variable_TYPE_REQUIRE_IAP,
			Value: defaultString(os.Getenv("DEKART_REQUIRE_IAP"), ""),
		},
		{
			Type:  proto.GetEnvResponse_Variable_TYPE_REQUIRE_AMAZON_OIDC,
			Value: defaultString(os.Getenv("DEKART_REQUIRE_AMAZON_OIDC"), ""),
		},
	}
	return &proto.GetEnvResponse{
		Variables: variables,
	}, nil
}
