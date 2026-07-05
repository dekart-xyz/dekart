package dbtime

import (
	"testing"
	"time"
)

func TestParseTimestampAcceptsDatabaseDriverShapes(t *testing.T) {
	expected := time.Date(2026, 7, 5, 8, 30, 15, 0, time.UTC)
	cases := []struct {
		name  string
		value any
	}{
		{name: "time", value: expected},
		{name: "string", value: "2026-07-05 08:30:15"},
		{name: "bytes", value: []byte("2026-07-05 08:30:15")},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := ParseTimestamp(tc.value)
			if err != nil {
				t.Fatalf("ParseTimestamp returned error: %v", err)
			}
			if !got.Equal(expected) {
				t.Fatalf("ParseTimestamp = %s, want %s", got.Format(time.RFC3339), expected.Format(time.RFC3339))
			}
		})
	}
}

func TestParseTimestampRejectsUnsupportedShape(t *testing.T) {
	if _, err := ParseTimestamp(nil); err == nil {
		t.Fatal("ParseTimestamp returned nil error for unsupported timestamp shape")
	}
}
