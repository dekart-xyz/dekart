package dekart

import (
	"dekart/src/proto"
	"testing"
)

func TestResultExtensionByConnectionType(t *testing.T) {
	t.Run("wherobots uses parquet", func(t *testing.T) {
		got := resultExtensionByConnectionType(proto.ConnectionType_CONNECTION_TYPE_WHEROBOTS)
		if got != "parquet" {
			t.Fatalf("expected parquet, got %q", got)
		}
	})

	t.Run("other connections default to csv", func(t *testing.T) {
		got := resultExtensionByConnectionType(proto.ConnectionType_CONNECTION_TYPE_BIGQUERY)
		if got != "csv" {
			t.Fatalf("expected csv, got %q", got)
		}
	})
}
