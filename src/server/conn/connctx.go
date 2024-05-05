package conn

import (
	"context"
	"dekart/src/proto"

	"github.com/rs/zerolog/log"
)

type Connection struct {
	ID                 string
	ConnectionName     string
	BigqueryProjectID  string
	CloudStorageBucket string
}

type ConnectionContextKey string

const connectionContextKey ConnectionContextKey = "connection"

func GetCtx(ctx context.Context, connection *proto.Connection) context.Context {
	if connection == nil {
		return context.WithValue(ctx, connectionContextKey, Connection{})
	}
	return context.WithValue(ctx, connectionContextKey, Connection{
		ID:                 connection.Id,
		ConnectionName:     connection.ConnectionName,
		BigqueryProjectID:  connection.BigqueryProjectId,
		CloudStorageBucket: connection.CloudStorageBucket,
	})
}

func FromCtx(ctx context.Context) Connection {
	connection, ok := ctx.Value(connectionContextKey).(Connection)
	if !ok {
		log.Error().Msg("Connection not found in context")
		return Connection{}
	}
	return connection
}
