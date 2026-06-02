package dekart

import "os"

type MetadataBackend string

const (
	MetadataBackendPostgres MetadataBackend = "postgres"
	MetadataBackendSQLite   MetadataBackend = "sqlite"
)

var postgresMetadataEnvVars = []string{
	"DEKART_POSTGRES_URL",
	"DEKART_POSTGRES_USER",
	"DEKART_POSTGRES_PASSWORD",
	"DEKART_POSTGRES_HOST",
	"DEKART_POSTGRES_PORT",
	"DEKART_POSTGRES_DB",
}

// SelectedMetadataBackend returns the metadata backend selected by startup env.
func SelectedMetadataBackend() MetadataBackend {
	if HasPostgresMetadataEnv() {
		return MetadataBackendPostgres
	}
	return MetadataBackendSQLite
}

// HasPostgresMetadataEnv reports whether metadata Postgres configuration is present.
func HasPostgresMetadataEnv() bool {
	for _, key := range postgresMetadataEnvVars {
		if _, ok := os.LookupEnv(key); ok {
			return true
		}
	}
	return false
}

func IsSqlite() bool {
	return SelectedMetadataBackend() == MetadataBackendSQLite
}
