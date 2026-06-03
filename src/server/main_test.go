package main

import (
	"os"
	"testing"
)

func clearPostgresMetadataURLEnv(t *testing.T) {
	t.Helper()
	for _, key := range []string{
		"DEKART_POSTGRES_URL",
		"DEKART_POSTGRES_USER",
		"DEKART_POSTGRES_PASSWORD",
		"DEKART_POSTGRES_HOST",
		"DEKART_POSTGRES_PORT",
		"DEKART_POSTGRES_DB",
	} {
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

func TestValidateStorageConfigDisablesFileUploadForPG(t *testing.T) {
	t.Setenv("DEKART_STORAGE", "PG")
	t.Setenv("DEKART_ALLOW_FILE_UPLOAD", "1")
	t.Setenv("DEKART_CLOUD_STORAGE_BUCKET", "")

	validateStorageConfig()

	if got := os.Getenv("DEKART_ALLOW_FILE_UPLOAD"); got != "0" {
		t.Fatalf("expected file upload to be disabled, got %q", got)
	}
}

func TestPostgresMetadataURLUsesExplicitURL(t *testing.T) {
	clearPostgresMetadataURLEnv(t)
	os.Setenv("DEKART_POSTGRES_URL", "postgres://custom")

	if got := postgresMetadataURL(); got != "postgres://custom" {
		t.Fatalf("unexpected URL: %q", got)
	}
}

func TestPostgresMetadataURLUsesDefaultsForMissingStructuredFields(t *testing.T) {
	clearPostgresMetadataURLEnv(t)
	os.Setenv("DEKART_POSTGRES_HOST", "db")

	want := "postgres://dekart:@db:5432/dekart?sslmode=disable"
	if got := postgresMetadataURL(); got != want {
		t.Fatalf("unexpected URL: %q", got)
	}
}
