package storage

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/bqstorage"
	"dekart/src/server/conn"
	"strings"

	"github.com/rs/zerolog/log"
)

// UserStorage implements Storage interface and creates StorageObject based on user connection settings
type UserStorage struct {
}

func NewUserStorage() *UserStorage {
	return &UserStorage{}
}

func (s *UserStorage) GetObject(ctx context.Context, _ string, object string) StorageObject {
	connection := conn.FromCtx(ctx)
	parts := strings.Split(object, ".")
	if connection.ConnectionType == proto.Connection_CONNECTION_TYPE_SNOWFLAKE {
		return NewSnowflakeStorageObject(parts[0], connection)
	}
	if connection.CloudStorageBucket != "" {
		bucketName := connection.CloudStorageBucket
		return GoogleCloudStorageObject{
			bucketName,
			object,
			log.With().Str("GoogleCloudStorageObject", object).Logger(),
			true,
		}
	}
	return bqstorage.BigQueryStorageObject{
		JobID:             parts[0],
		BigqueryProjectId: connection.BigqueryProjectId,
	}
}

func (s *UserStorage) CanSaveQuery(ctx context.Context, bucketName string) bool {
	connection := conn.FromCtx(ctx)
	return connection.CloudStorageBucket != "" || bucketName != ""
}
