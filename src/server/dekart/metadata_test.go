package dekart

import (
	"os"
	"testing"
)

func clearMetadataEnv(t *testing.T) {
	t.Helper()
	keys := append([]string{}, postgresMetadataEnvVars...)
	keys = append(keys, "DEKART_SQLITE_DB_PATH", "DEKART_POSTGRES_DATASOURCE_CONNECTION", "DEKART_DATASOURCE")
	for _, key := range keys {
		key := key
		value, ok := os.LookupEnv(key)
		os.Unsetenv(key)
		t.Cleanup(func() {
			if ok {
				os.Setenv(key, value)
			} else {
				os.Unsetenv(key)
			}
		})
	}
}

func TestSelectedMetadataBackendDefaultsToSQLite(t *testing.T) {
	clearMetadataEnv(t)

	if SelectedMetadataBackend() != MetadataBackendSQLite {
		t.Fatalf("expected SQLite metadata")
	}
	if !IsSqlite() {
		t.Fatalf("expected IsSqlite to be true")
	}
}

func TestSelectedMetadataBackendUsesPostgresURL(t *testing.T) {
	clearMetadataEnv(t)
	os.Setenv("DEKART_POSTGRES_URL", "postgres://dekart:dekart@localhost:5432/dekart")

	if SelectedMetadataBackend() != MetadataBackendPostgres {
		t.Fatalf("expected Postgres metadata")
	}
	if IsSqlite() {
		t.Fatalf("expected IsSqlite to be false")
	}
}

func TestSelectedMetadataBackendUsesStructuredPostgresEnv(t *testing.T) {
	clearMetadataEnv(t)
	os.Setenv("DEKART_POSTGRES_HOST", "localhost")

	if SelectedMetadataBackend() != MetadataBackendPostgres {
		t.Fatalf("expected Postgres metadata")
	}
}

func TestSelectedMetadataBackendPrefersPostgresEnvOverSQLitePath(t *testing.T) {
	clearMetadataEnv(t)
	os.Setenv("DEKART_SQLITE_DB_PATH", "./dekart.db")
	os.Setenv("DEKART_POSTGRES_HOST", "localhost")

	if SelectedMetadataBackend() != MetadataBackendPostgres {
		t.Fatalf("expected Postgres metadata")
	}
}

func TestSelectedMetadataBackendIgnoresPostgresDatasourceConnection(t *testing.T) {
	clearMetadataEnv(t)
	os.Setenv("DEKART_SQLITE_DB_PATH", "./dekart.db")
	os.Setenv("DEKART_POSTGRES_DATASOURCE_CONNECTION", "postgres://user:pass@localhost:5432/geodata")

	if SelectedMetadataBackend() != MetadataBackendSQLite {
		t.Fatalf("expected SQLite metadata")
	}
}

func TestSelectedMetadataBackendIgnoresPostgresDatasourceMode(t *testing.T) {
	clearMetadataEnv(t)
	os.Setenv("DEKART_SQLITE_DB_PATH", "./dekart.db")
	os.Setenv("DEKART_DATASOURCE", "PG")

	if SelectedMetadataBackend() != MetadataBackendSQLite {
		t.Fatalf("expected SQLite metadata")
	}
}

func TestSQLiteBackupDisabledWhenPostgresMetadataEnvWins(t *testing.T) {
	clearMetadataEnv(t)
	os.Setenv("DEKART_SQLITE_DB_PATH", "./dekart.db")
	os.Setenv("DEKART_POSTGRES_HOST", "localhost")

	if isSQLiteEnabled() {
		t.Fatalf("expected SQLite backup to be disabled")
	}
}
