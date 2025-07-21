package snowflakeutils

import (
	"io"

	"github.com/rs/zerolog"
	sf "github.com/snowflakedb/gosnowflake"
)

// ConfigureSnowflakeLogger replaces the default Snowflake logger
// to suppress context cancellation errors.
func ConfigureSnowflakeLogger(dekartLogger *zerolog.Logger) {
	l := sf.CreateDefaultLogger()
	// l.SetLogLevel("OFF")
	l.SetOutput(io.Discard)
	sf.SetLogger(&l)
}
