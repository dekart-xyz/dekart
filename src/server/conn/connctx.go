package conn

import (
	"context"
	"dekart/src/proto"
	"fmt"
	"os"
	"runtime"

	"github.com/rs/zerolog/log"
)

type ConnectionContextKey string

const connectionContextKey ConnectionContextKey = "connection"

var dekartBigQueryProjectID = os.Getenv("DEKART_BIGQUERY_PROJECT_ID")
var dekartCloudStorageBucket = os.Getenv("DEKART_CLOUD_STORAGE_BUCKET")
var dekartDataSource = os.Getenv("DEKART_DATASOURCE")

func IsUserDefined() bool {
	return (dekartBigQueryProjectID == "" && dekartDataSource == "BQ") || (dekartCloudStorageBucket == "" && dekartDataSource != "SNOWFLAKE")
}

func GetCtx(ctx context.Context, connection *proto.Connection) context.Context {
	return context.WithValue(ctx, connectionContextKey, connection)
}

func FromCtx(ctx context.Context) *proto.Connection {
	connection, ok := ctx.Value(connectionContextKey).(*proto.Connection)
	if !ok {
		_, file, line, _ := runtime.Caller(1)
		log.Error().Caller().Str("called_from",
			fmt.Sprintf("%s:%d", file, line),
		).Msg("Connection not found in context")
		return &proto.Connection{}
	}
	return connection
}

func CopyConnectionCtx(sourceCtx, destCtx context.Context) context.Context {
	connection := FromCtx(sourceCtx)
	return GetCtx(destCtx, connection)
}
