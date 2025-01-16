package errtype

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"testing"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
)

// TestLogWriter tests the LogWriter to ensure it modifies the log level for "context canceled" errors.
func TestLogWriter(t *testing.T) {
	var buf bytes.Buffer
	writer := &LogWriter{Writer: &buf}

	logger := zerolog.New(writer).With().Timestamp().Logger()

	// Log a context canceled error
	logger.Error().Err(context.Canceled).Msg("An error occurred")

	// Log a different error
	logger.Error().Msg("A different error occurred")

	// Parse the log entries
	var logEntries []map[string]interface{}
	decoder := json.NewDecoder(&buf)
	for {
		var logEntry map[string]interface{}
		if err := decoder.Decode(&logEntry); err == io.EOF {
			break
		} else if err != nil {
			t.Fatalf("Failed to decode log entry: %v", err)
		}
		logEntries = append(logEntries, logEntry)
	}

	// Verify the log entries
	assert.Len(t, logEntries, 2)

	// Check the first log entry (context canceled error)
	assert.Equal(t, "warn", logEntries[0]["level"])
	assert.Equal(t, "context canceled", logEntries[0]["error"])

	// Check the second log entry (different error)
	assert.Equal(t, "error", logEntries[1]["level"])
	assert.Equal(t, "A different error occurred", logEntries[1]["message"])
}
