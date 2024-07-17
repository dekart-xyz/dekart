package dekart

import (
	"context"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/job"
	"dekart/src/server/report"
	"dekart/src/server/secrets"
	"dekart/src/server/storage"
	"dekart/src/server/user"
	"encoding/json"
	"io/ioutil"
	"net/http"
	"os"

	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Server is Dekart Endpoints implementation (HTTP and GRPC)
type Server struct {
	db            *sql.DB
	reportStreams *report.Streams
	userStreams   *user.Streams
	storage       storage.Storage
	proto.UnimplementedDekartServer
	jobs job.Store
}

// Unauthenticated error returned when no user claims in context
var Unauthenticated error = status.Error(codes.Unauthenticated, "UNAUTHENTICATED")

// NewServer returns new Dekart Server
func NewServer(db *sql.DB, storageBucket storage.Storage, jobs job.Store) *Server {
	server := Server{
		db:            db,
		reportStreams: report.NewStreams(),
		userStreams:   user.NewStreams(),
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

type ProjectList struct {
	Projects []struct {
		Id string `json:"id"`
	} `json:"projects"`
}

// GetGcpProjectList returns list of GCP projects for connection autosuggest
func (s Server) GetGcpProjectList(ctx context.Context, req *proto.GetGcpProjectListRequest) (*proto.GetGcpProjectListResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	tokenSource := user.GetTokenSource(ctx)
	if tokenSource == nil {
		log.Warn().Msg("GetGcpProjectList called without token source")
		return nil, Unauthenticated
	}

	token, err := tokenSource.Token()
	if err != nil {
		log.Err(err).Msg("Cannot get token")
		return nil, status.Error(codes.Internal, err.Error())
	}
	httpClient := &http.Client{}
	r, err := http.NewRequestWithContext(ctx, "GET", "https://www.googleapis.com/bigquery/v2/projects?maxResults=100000", nil)
	if err != nil {
		log.Err(err).Msg("Cannot create request")
		return nil, status.Error(codes.Internal, err.Error())
	}
	token.SetAuthHeader(r)
	resp, err := httpClient.Do(r)
	if err != nil {
		log.Err(err).Msg("Cannot list projects")
		return nil, status.Error(codes.Internal, err.Error())
	}
	defer resp.Body.Close()
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		log.Err(err).Msg("Cannot read response")
		return nil, status.Error(codes.Internal, err.Error())
	}
	projectList := &ProjectList{}
	err = json.Unmarshal(body, projectList)
	if err != nil {
		log.Err(err).Msg("Cannot unmarshal response")
		return nil, status.Error(codes.Internal, err.Error())
	}
	var projects []string
	for _, project := range projectList.Projects {
		projects = append(projects, project.Id)
	}
	return &proto.GetGcpProjectListResponse{
		Projects: projects,
	}, nil
}

// GetEnv variables to the client
func (s Server) GetEnv(ctx context.Context, req *proto.GetEnvRequest) (*proto.GetEnvResponse, error) {
	claims := user.GetClaims(ctx)
	var variables []*proto.GetEnvResponse_Variable
	if claims == nil {
		// unauthenticated user, no sensitive variables must be exposed
		variables = []*proto.GetEnvResponse_Variable{
			{
				Type:  proto.GetEnvResponse_Variable_TYPE_REQUIRE_GOOGLE_OAUTH,
				Value: defaultString(os.Getenv("DEKART_REQUIRE_GOOGLE_OAUTH"), ""),
			},
		}
	} else {
		// authenticated user
		homePageUrl := os.Getenv("DEKART_UX_HOMEPAGE")
		if homePageUrl == "" {
			homePageUrl = "https://dekart.xyz/cloud/"
		}
		variables = []*proto.GetEnvResponse_Variable{
			{
				Type:  proto.GetEnvResponse_Variable_TYPE_MAPBOX_TOKEN,
				Value: os.Getenv("DEKART_MAPBOX_TOKEN"),
			},
			{
				Type:  proto.GetEnvResponse_Variable_TYPE_UX_DATA_DOCUMENTATION,
				Value: os.Getenv("DEKART_UX_DATA_DOCUMENTATION"),
			},
			{
				Type:  proto.GetEnvResponse_Variable_TYPE_UX_ACCESS_ERROR_INFO_HTML,
				Value: os.Getenv("DEKART_UX_ACCESS_ERROR_INFO_HTML"),
			},
			{
				Type:  proto.GetEnvResponse_Variable_TYPE_UX_NOT_FOUND_ERROR_INFO_HTML,
				Value: os.Getenv("DEKART_UX_NOT_FOUND_ERROR_INFO_HTML"),
			},
			{
				Type:  proto.GetEnvResponse_Variable_TYPE_UX_SAMPLE_QUERY_SQL,
				Value: os.Getenv("DEKART_UX_SAMPLE_QUERY_SQL"),
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
			{
				Type:  proto.GetEnvResponse_Variable_TYPE_DISABLE_USAGE_STATS,
				Value: defaultString(os.Getenv("DEKART_DISABLE_USAGE_STATS"), ""),
			},
			{
				Type:  proto.GetEnvResponse_Variable_TYPE_REQUIRE_GOOGLE_OAUTH,
				Value: defaultString(os.Getenv("DEKART_REQUIRE_GOOGLE_OAUTH"), ""),
			},
			{
				Type:  proto.GetEnvResponse_Variable_TYPE_BIGQUERY_PROJECT_ID,
				Value: defaultString(os.Getenv("DEKART_BIGQUERY_PROJECT_ID"), ""),
			},
			{
				Type:  proto.GetEnvResponse_Variable_TYPE_CLOUD_STORAGE_BUCKET,
				Value: defaultString(os.Getenv("DEKART_CLOUD_STORAGE_BUCKET"), ""),
			},
			{
				Type:  proto.GetEnvResponse_Variable_TYPE_AES_KEY,
				Value: secrets.GetClientKeyBase64(*claims),
			},
			{
				Type:  proto.GetEnvResponse_Variable_TYPE_AES_IV,
				Value: secrets.GetClientIVBase64(*claims),
			},
		}

	}
	return &proto.GetEnvResponse{
		Variables: variables,
	}, nil
}
