package conn

import (
	"context"
	"dekart/src/proto"
	"os"

	"github.com/rs/zerolog/log"
)

type ConnectionContextKey string

const connectionContextKey ConnectionContextKey = "connection"

var dekartBigQueryProjectID = os.Getenv("DEKART_BIGQUERY_PROJECT_ID")
var dekartCloudStorageBucket = os.Getenv("DEKART_CLOUD_STORAGE_BUCKET")
var dekartDataSource = os.Getenv("DEKART_DATASOURCE")
var dekartRequireGoogleOAuth = os.Getenv("DEKART_REQUIRE_GOOGLE_OAUTH")

func IsUserDefined() bool {
	return (dekartBigQueryProjectID == "" && dekartDataSource == "BQ") ||
		(dekartCloudStorageBucket == "" && dekartDataSource != "SNOWFLAKE") ||
		dekartRequireGoogleOAuth == "1" // use user defined connection when require google oauth to reduce the number of possible configurations
}

// CanShareReports returns true if reports can be shared between users for backend configured connections
func CanShareReports() bool {
	// For backend configured connections, we can share reports only if the datasource is Snowflake or the cloud storage bucket is set
	return ((dekartCloudStorageBucket != "" && dekartDataSource == "BQ") || dekartDataSource == "SNOWFLAKE")
}

func GetCtx(ctx context.Context, connection *proto.Connection) context.Context {
	return context.WithValue(ctx, connectionContextKey, connection)
}

func FromCtx(ctx context.Context) *proto.Connection {
	connection, ok := ctx.Value(connectionContextKey).(*proto.Connection)
	if !ok {
		log.Error().Msg("Connection not found in context")
		return &proto.Connection{}
	}
	return connection
}

func CopyConnectionCtx(sourceCtx, destCtx context.Context) context.Context {
	connection := FromCtx(sourceCtx)
	return GetCtx(destCtx, connection)
}
