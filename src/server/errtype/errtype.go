package errtype

import (
	"bytes"
	"io"
	"regexp"
)

type EmptyResult struct{}

func (e *EmptyResult) Error() string {
	return "Empty result"
}

var ContextCancelledRe = regexp.MustCompile(`context canceled`)

var WriteClosedPipeRe = regexp.MustCompile(`write on closed pipe`)

var RPCPermissionDeniedRe = regexp.MustCompile(`rpc error: code = PermissionDenied desc = (.*)`)

// Transport closing - client disconnected during gRPC stream
var TransportClosingRe = regexp.MustCompile(`transport is closing`)

// 8080-> timeout, perhaps client disconnected
var WriteTimeoutRe = regexp.MustCompile(`write tcp.*8080`)

var SnowflakeJWTInvalidRe = regexp.MustCompile(`(390144|08004)`)

// BigQuery job not found error pattern
var BigQueryJobNotFoundRe = regexp.MustCompile(`Not found: Job .*, notFound`)

// Expired Error is returned when temp storage is expired
type Expired struct {
}

func (e *Expired) Error() string {
	return "expired"
}

// LogWriter is an io.Writer that modifies zerolog log entries.
type LogWriter struct {
	Writer io.Writer
}

// Write parses the JSON log entry, modifies it if necessary, and writes it to the underlying writer.
func (cw *LogWriter) Write(p []byte) (n int, err error) {
	// Check if the log entry contains an error with "context canceled"
	if ContextCancelledRe.Match(p) {
		// Replace the log level with "warn" in the original JSON string
		modifiedLogEntry := bytes.Replace(p, []byte(`"level":"error"`), []byte(`"level":"warn"`), 1)

		// Write the modified log entry to the underlying writer
		return cw.Writer.Write(modifiedLogEntry)
	}

	// If no modification is needed, write the original log entry
	return cw.Writer.Write(p)
}
