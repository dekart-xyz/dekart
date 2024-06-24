package storage

import (
	"context"
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
	log.Debug().Str("CloudStorageBucket", connection.CloudStorageBucket).Str("object", object).Msg("GetObject")
	if connection.CloudStorageBucket != "" {
		bucketName := connection.CloudStorageBucket
		log.Debug().Msg("returning GoogleCloudStorageObject")
		return GoogleCloudStorageObject{
			bucketName,
			object,
			log.With().Str("GoogleCloudStorageObject", object).Logger(),
			true,
		}
	}
	parts := strings.Split(object, ".")
	log.Debug().Msg("returning BigQueryStorageObject")
	return bqstorage.BigQueryStorageObject{
		JobID:             parts[0],
		BigqueryProjectId: connection.BigqueryProjectID,
	}
}

func (s *UserStorage) CanSaveQuery(ctx context.Context, bucketName string) bool {
	connection := conn.FromCtx(ctx)
	return connection.CloudStorageBucket != "" || bucketName != ""
}
