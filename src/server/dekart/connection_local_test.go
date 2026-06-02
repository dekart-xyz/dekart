package dekart

import (
	"context"
	"testing"
)

func TestGetConnectionSystemUserNonCloudReturnsSyntheticLocalConnection(t *testing.T) {
	t.Setenv("DEKART_DATASOURCE", "USER")
	t.Setenv("DEKART_CLOUD", "")
	t.Setenv("DEKART_ALLOW_FILE_UPLOAD", "1")

	s := Server{}
	con, err := s.getConnection(context.Background(), "")
	if err != nil {
		t.Fatalf("getConnection: %v", err)
	}
	if con == nil {
		t.Fatal("expected synthetic connection, got nil")
	}
	if con.ConnectionName != "Local Files" {
		t.Fatalf("unexpected connection name: %s", con.ConnectionName)
	}
	if !con.IsDefault {
		t.Fatal("expected default connection")
	}
	if !con.CanStoreFiles {
		t.Fatal("expected file uploads enabled")
	}
}

func TestGetConnectionSystemUserNonCloudUploadDisabled(t *testing.T) {
	t.Setenv("DEKART_DATASOURCE", "USER")
	t.Setenv("DEKART_CLOUD", "")

	for _, value := range []string{"", "0", "false"} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("DEKART_ALLOW_FILE_UPLOAD", value)

			s := Server{}
			con, err := s.getConnection(context.Background(), "")
			if err != nil {
				t.Fatalf("getConnection: %v", err)
			}
			if con == nil {
				t.Fatal("expected synthetic connection, got nil")
			}
			if con.CanStoreFiles {
				t.Fatal("expected file uploads disabled")
			}
		})
	}
}

func TestFileUploadEnvValueNormalizesDisabledValues(t *testing.T) {
	for _, value := range []string{"", "0", "false"} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("DEKART_ALLOW_FILE_UPLOAD", value)
			if got := FileUploadEnvValue(); got != "" {
				t.Fatalf("unexpected file upload env value: %q", got)
			}
		})
	}
}
